import { describe, it, expect } from "vitest";
import { findDialogFiles, unreached, unknownSources } from "./e2e-dialog-coverage";

describe("dialog coverage scanner", () => {
  it("finds files that render a dialog root and counts the roots", () => {
    const found = findDialogFiles([
      { path: "client/src/a.tsx", text: "<Dialog open={open}>\n<AlertDialog open>\n" },
      { path: "client/src/b.tsx", text: "<DialogContent>only content, the root lives elsewhere</DialogContent>" },
      { path: "client/src/c.tsx", text: "<Sheet open>" },
      { path: "client/src/ui/dialog.tsx", text: "const Dialog = DialogPrimitive.Root" },
      { path: "client/src/d.test.tsx", text: "<Dialog open>" },
    ]);
    expect(found).toEqual([{ path: "client/src/a.tsx", roots: 2 }, { path: "client/src/c.tsx", roots: 1 }]);
  });

  it("lists the files no registry entry reaches", () => {
    const files = [{ path: "client/src/a.tsx", roots: 2 }, { path: "client/src/c.tsx", roots: 1 }];
    expect(unreached(files, ["client/src/a.tsx"])).toEqual([{ path: "client/src/c.tsx", roots: 1 }]);
  });
});

describe("unknownSources", () => {
  it("names a claimed source that has no dialog root of its own", () => {
    // The /reports mistake this guards against: crediting the file the
    // opener's onClick *navigates from* instead of the file that actually
    // renders the <Dialog>.
    const files = [{ path: "client/src/a.tsx", roots: 2 }];
    expect(unknownSources(files, ["client/src/a.tsx", "client/src/wrong-file.tsx"])).toEqual(["client/src/wrong-file.tsx"]);
  });

  it("is empty when every claimed source has at least one root", () => {
    const files = [{ path: "client/src/a.tsx", roots: 2 }, { path: "client/src/c.tsx", roots: 1 }];
    expect(unknownSources(files, ["client/src/a.tsx", "client/src/c.tsx"])).toEqual([]);
  });

  it("reports each unknown source only once even if claimed more than once", () => {
    const files = [{ path: "client/src/a.tsx", roots: 1 }];
    expect(unknownSources(files, ["client/src/wrong.tsx", "client/src/wrong.tsx"])).toEqual(["client/src/wrong.tsx"]);
  });
});
