class Ingraft < Formula
  desc "Route repository context into coding-agent workflows"
  homepage "https://ingraft.dev"
  url "https://registry.npmjs.org/@ingraft/cli/-/cli-0.3.4.tgz"
  sha256 "39326a20ce30f7b19e394d31f22b0efd5875621068c4bce6f7d5f33f8f27e9df"
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
