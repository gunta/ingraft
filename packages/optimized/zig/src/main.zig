const std = @import("std");

const Allocator = std.mem.Allocator;
const Io = std.Io;

const dependency_sections = [_][]const u8{
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
};

const ignored_dirs = [_][]const u8{
    ".git",
    ".jj",
    ".moon",
    ".next",
    ".nx",
    ".pants.d",
    ".rush",
    ".turbo",
    ".zig-cache",
    ".gradle",
    "_build",
    "bazel-bin",
    "bazel-out",
    "bazel-testlogs",
    "build",
    "coverage",
    "deps",
    "dist",
    "node_modules",
    "target",
    "vendor",
    "zig-out",
};

const Candidate = struct {
    manifestPath: []const u8,
    packageName: []const u8,
    packageSpec: []const u8,
    section: []const u8,
    source: []const u8,
    status: []const u8,
    syncPackage: []const u8,
};

const Output = struct {
    candidates: []const Candidate,
    tasks: []const Task,
};

const Task = struct {};

pub fn main(init: std.process.Init) !void {
    const arena = init.arena.allocator();
    const cli = try parseArgs(arena, init);
    const output = Output{
        .candidates = try scanRoot(arena, init.io, cli.root),
        .tasks = &.{},
    };

    var stdout_buffer: [4096]u8 = undefined;
    var stdout_file_writer: Io.File.Writer = .init(.stdout(), init.io, &stdout_buffer);
    var json_writer: std.json.Stringify = .{
        .writer = &stdout_file_writer.interface,
        .options = .{ .whitespace = .indent_2 },
    };
    try json_writer.write(output);
    try stdout_file_writer.interface.writeAll("\n");
    try stdout_file_writer.interface.flush();
}

fn scanRoot(allocator: Allocator, io: Io, root_path: []const u8) ![]const Candidate {
    var root_dir = if (std.fs.path.isAbsolute(root_path))
        try Io.Dir.openDirAbsolute(io, root_path, .{ .iterate = true })
    else
        try Io.Dir.cwd().openDir(io, root_path, .{ .iterate = true });
    defer root_dir.close(io);

    return scanDir(allocator, io, root_dir);
}

fn scanDir(allocator: Allocator, io: Io, root_dir: Io.Dir) ![]const Candidate {
    var candidates: std.ArrayList(Candidate) = .empty;
    defer candidates.deinit(allocator);

    var walker = try root_dir.walkSelectively(allocator);
    defer walker.deinit();

    while (try walker.next(io)) |entry| {
        switch (entry.kind) {
            .directory => {
                if (!isIgnoredDir(entry.basename)) {
                    try walker.enter(io, entry);
                }
            },
            .file => {
                if (std.mem.eql(u8, entry.basename, "package.json")) {
                    appendPackageManifestCandidates(allocator, io, root_dir, entry.path, &candidates) catch |err| switch (err) {
                        error.OutOfMemory => return error.OutOfMemory,
                        else => {},
                    };
                }
            },
            else => {},
        }
    }

    std.sort.pdq(Candidate, candidates.items, {}, candidateLessThan);
    return candidates.toOwnedSlice(allocator);
}

fn appendPackageManifestCandidates(
    allocator: Allocator,
    io: Io,
    root_dir: Io.Dir,
    manifest_path: []const u8,
    candidates: *std.ArrayList(Candidate),
) !void {
    const manifest_text = try root_dir.readFileAlloc(
        io,
        manifest_path,
        allocator,
        Io.Limit.limited(8 * 1024 * 1024),
    );
    const parsed = try std.json.parseFromSliceLeaky(std.json.Value, allocator, manifest_text, .{});

    switch (parsed) {
        .object => |object| {
            const manifest_path_copy = try allocator.dupe(u8, manifest_path);
            for (dependency_sections) |section_name| {
                const section_value = object.get(section_name) orelse continue;
                try appendSectionCandidates(allocator, manifest_path_copy, section_name, section_value, candidates);
            }
        },
        else => {},
    }
}

fn appendSectionCandidates(
    allocator: Allocator,
    manifest_path: []const u8,
    section_name: []const u8,
    section_value: std.json.Value,
    candidates: *std.ArrayList(Candidate),
) !void {
    switch (section_value) {
        .object => |dependencies| {
            var iterator = dependencies.iterator();
            while (iterator.next()) |entry| {
                const spec = switch (entry.value_ptr.*) {
                    .string => |value| value,
                    else => continue,
                };
                const package_name = entry.key_ptr.*;
                const ecosystem = ecosystemForPackage(package_name);
                const package_name_copy = try allocator.dupe(u8, package_name);
                try candidates.append(allocator, .{
                    .manifestPath = manifest_path,
                    .packageName = package_name_copy,
                    .packageSpec = try allocator.dupe(u8, spec),
                    .section = section_name,
                    .source = ecosystem,
                    .status = "metadata-unavailable",
                    .syncPackage = try syncPackageFor(allocator, ecosystem, package_name_copy),
                });
            }
        },
        else => {},
    }
}

fn parseArgs(allocator: Allocator, init: std.process.Init) !struct { root: []const u8 } {
    const args = try init.minimal.args.toSlice(allocator);
    var root: []const u8 = ".";

    var index: usize = 1;
    while (index < args.len) : (index += 1) {
        const arg = args[index];
        if (std.mem.eql(u8, arg, "--root") or std.mem.eql(u8, arg, "-r")) {
            index += 1;
            if (index >= args.len) return error.MissingRootPath;
            root = args[index];
            continue;
        }
        return error.InvalidArgument;
    }

    return .{ .root = root };
}

fn isIgnoredDir(name: []const u8) bool {
    inline for (ignored_dirs) |ignored| {
        if (std.mem.eql(u8, name, ignored)) return true;
    }
    return false;
}

fn ecosystemForPackage(name: []const u8) []const u8 {
    if (std.mem.eql(u8, name, "react")) return "react";
    if (std.mem.eql(u8, name, "react-native") or std.mem.startsWith(u8, name, "@react-native/")) {
        return "react-native";
    }
    if (std.mem.eql(u8, name, "expo") or
        std.mem.startsWith(u8, name, "expo-") or
        std.mem.startsWith(u8, name, "@expo/"))
    {
        return "expo";
    }
    return "npm";
}

fn syncPackageFor(allocator: Allocator, ecosystem: []const u8, package_name: []const u8) ![]const u8 {
    if (std.mem.eql(u8, ecosystem, "npm")) return package_name;
    return std.fmt.allocPrint(allocator, "{s}:{s}", .{ ecosystem, package_name });
}

fn candidateLessThan(_: void, lhs: Candidate, rhs: Candidate) bool {
    const manifest_order = std.mem.order(u8, lhs.manifestPath, rhs.manifestPath);
    if (manifest_order != .eq) return manifest_order == .lt;

    const section_order = std.mem.order(u8, lhs.section, rhs.section);
    if (section_order != .eq) return section_order == .lt;

    return std.mem.order(u8, lhs.packageName, rhs.packageName) == .lt;
}

test "scanRoot finds package manifests outside ignored directories" {
    var tmp = std.testing.tmpDir(.{ .iterate = true });
    defer tmp.cleanup();

    try writeFile(tmp.dir, "package.json",
        \\{
        \\  "dependencies": {
        \\    "react": "^19.0.0",
        \\    "lodash": "^4.17.21"
        \\  },
        \\  "peerDependencies": {
        \\    "@react-native/async-storage": "^1.0.0"
        \\  }
        \\}
    );
    try writeFile(tmp.dir, "apps/web/package.json",
        \\{
        \\  "devDependencies": {
        \\    "expo": "^52.0.0"
        \\  }
        \\}
    );
    try writeFile(tmp.dir, "node_modules/skip/package.json",
        \\{
        \\  "dependencies": {
        \\    "ignored-node-modules": "1.0.0"
        \\  }
        \\}
    );
    try writeFile(tmp.dir, "vendor/effect/package.json",
        \\{
        \\  "dependencies": {
        \\    "ignored-vendor": "1.0.0"
        \\  }
        \\}
    );
    try writeFile(tmp.dir, "dist/generated/package.json",
        \\{
        \\  "dependencies": {
        \\    "ignored-dist": "1.0.0"
        \\  }
        \\}
    );

    var arena_state = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena_state.deinit();

    const candidates = try scanDir(arena_state.allocator(), std.testing.io, tmp.dir);

    try std.testing.expectEqual(@as(usize, 4), candidates.len);
    try expectCandidate(candidates, .{
        .manifestPath = "package.json",
        .packageName = "lodash",
        .packageSpec = "^4.17.21",
        .section = "dependencies",
        .source = "npm",
        .status = "metadata-unavailable",
        .syncPackage = "lodash",
    });
    try expectCandidate(candidates, .{
        .manifestPath = "package.json",
        .packageName = "react",
        .packageSpec = "^19.0.0",
        .section = "dependencies",
        .source = "react",
        .status = "metadata-unavailable",
        .syncPackage = "react:react",
    });
    try expectCandidate(candidates, .{
        .manifestPath = "package.json",
        .packageName = "@react-native/async-storage",
        .packageSpec = "^1.0.0",
        .section = "peerDependencies",
        .source = "react-native",
        .status = "metadata-unavailable",
        .syncPackage = "react-native:@react-native/async-storage",
    });
    try expectCandidate(candidates, .{
        .manifestPath = "apps/web/package.json",
        .packageName = "expo",
        .packageSpec = "^52.0.0",
        .section = "devDependencies",
        .source = "expo",
        .status = "metadata-unavailable",
        .syncPackage = "expo:expo",
    });
}

test "json output keeps the deps-json shape" {
    const output = Output{
        .candidates = &.{
            .{
                .manifestPath = "package.json",
                .packageName = "react",
                .packageSpec = "^19.0.0",
                .section = "dependencies",
                .source = "react",
                .status = "metadata-unavailable",
                .syncPackage = "react:react",
            },
        },
        .tasks = &.{},
    };

    var out: std.Io.Writer.Allocating = .init(std.testing.allocator);
    defer out.deinit();

    var json_writer: std.json.Stringify = .{
        .writer = &out.writer,
        .options = .{ .whitespace = .indent_2 },
    };
    try json_writer.write(output);

    try std.testing.expectEqualStrings(
        \\{
        \\  "candidates": [
        \\    {
        \\      "manifestPath": "package.json",
        \\      "packageName": "react",
        \\      "packageSpec": "^19.0.0",
        \\      "section": "dependencies",
        \\      "source": "react",
        \\      "status": "metadata-unavailable",
        \\      "syncPackage": "react:react"
        \\    }
        \\  ],
        \\  "tasks": []
        \\}
    , out.written());
}

fn writeFile(dir: Io.Dir, sub_path: []const u8, data: []const u8) !void {
    if (std.fs.path.dirname(sub_path)) |parent| {
        try dir.createDirPath(std.testing.io, parent);
    }
    try dir.writeFile(std.testing.io, .{
        .sub_path = sub_path,
        .data = data,
    });
}

fn expectCandidate(candidates: []const Candidate, expected: Candidate) !void {
    for (candidates) |candidate| {
        if (std.mem.eql(u8, candidate.manifestPath, expected.manifestPath) and
            std.mem.eql(u8, candidate.packageName, expected.packageName))
        {
            try std.testing.expectEqualStrings(expected.packageSpec, candidate.packageSpec);
            try std.testing.expectEqualStrings(expected.section, candidate.section);
            try std.testing.expectEqualStrings(expected.source, candidate.source);
            try std.testing.expectEqualStrings(expected.status, candidate.status);
            try std.testing.expectEqualStrings(expected.syncPackage, candidate.syncPackage);
            return;
        }
    }
    return error.TestExpectedEqual;
}
