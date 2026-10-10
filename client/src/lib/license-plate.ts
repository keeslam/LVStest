// The formatter lives in shared/ so the server's mails write a plate the same way as the screens
// (final wave B, P2 review Minor 2). This re-export keeps the client's imports valid.
export { formatLicensePlate } from "@shared/license-plate";
