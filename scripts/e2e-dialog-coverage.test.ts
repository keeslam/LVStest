import { describe, it, expect } from "vitest";
import { findDialogFiles, unreached } from "./e2e-dialog-coverage";

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
