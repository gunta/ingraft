class Ingraft < Formula
  desc "Route repository context into coding-agent workflows"
  homepage "https://ingraft.dev"
  url "https://registry.npmjs.org/@ingraft/cli/-/cli-0.3.3.tgz"
  sha256 "a4910ee87b3d2c95a9ac0611dfe8e9cc3a2db42a103ae6d7e5cc1f6c716b9afc"
  license "MIT"
  preserve_rpath

  depends_on "oven-sh/bun/bun"
  depends_on "git"
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
    man1.install libexec/"lib/node_modules/@ingraft/cli/man/ingraft.1"
  end

  test do
    assert_match "repository context router for coding agents", shell_output("#{bin}/ingraft --help")
    assert_predicate man1/"ingraft.1", :exist?, "ingraft.1 man page was not installed"
  end
end
