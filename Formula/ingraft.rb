class Ingraft < Formula
  desc "Route repository context into coding-agent workflows"
  homepage "https://ingraft.dev"
  url "https://registry.npmjs.org/ingraft/-/ingraft-0.3.0.tgz"
  sha256 "f04516ce76215b41b2182b107d17f5aa40ff65c94040a71bb4eea579d8fa18aa"
  license "MIT"
  preserve_rpath

  depends_on "oven-sh/bun/bun"
  depends_on "git"
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match "repository context router for coding agents", shell_output("#{bin}/ingraft --help")
  end
end
