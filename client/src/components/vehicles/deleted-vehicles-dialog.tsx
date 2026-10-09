/**
 * Sub-project C (besluit B-36): the recycle bin moved to
 * `components/recycle-bin/recycle-bin-dialog.tsx` and takes a `kind` now. Every
 * screen opens its own kind and no caller of this old name is left; the file
 * stays as a re-export until the final clean-up wave removes it.
 */
export { RecycleBinDialog as DeletedVehiclesDialog } from "@/components/recycle-bin/recycle-bin-dialog";
