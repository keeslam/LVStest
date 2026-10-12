import { useTranslation } from "react-i18next";
import { formatPostcode, type AddressLookupQuery, type AddressLookupResult } from "@shared/address";
import { useAddressAutofill } from "@/hooks/use-address-autofill";
import { AddressLookupStatus } from "@/components/ui/address-lookup-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AddressLookupRowValue { postalCode: string; houseNumber: string; addition: string }

interface Props {
  value: AddressLookupRowValue;
  /** What the user just typed in this row; the form stores it wherever it keeps these fields. */
  onChange: (patch: Partial<AddressLookupRowValue>) => void;
  /** The street/city the lookup found; the form puts them in its own fields (and may still be edited). */
  onFound: (result: AddressLookupResult, query: AddressLookupQuery) => void;
  fetcher: (query: AddressLookupQuery) => Promise<AddressLookupResult>;
  /** False for a foreign address (country other than the Netherlands): the row then does not look anything up. */
  enabled?: boolean;
  /** Unique per row on a page (a form can hold a visit and a billing address). */
  idPrefix: string;
  className?: string;
}

/** A house letter is written in capitals ("4a" -> "4A"); other additions ("bis", "3") stay as typed. */
const tidyAddition = (raw: string) => { const a = raw.slice(0, 6); return /^[A-Za-z]{1,2}$/.test(a) ? a.toUpperCase() : a; };

/**
 * The first line of a Dutch address form: postcode, house number, addition. Once postcode and number are
 * complete the street and city fill themselves in; every field stays editable and a failed lookup only
 * shows a hint. Typing "12A" in the house number field moves the "A" to the addition. Use it above the
 * form's own street and city fields, wherever an address is typed.
 */
export function AddressLookupRow({ value, onChange, onFound, fetcher, enabled = true, idPrefix, className = "" }: Props) {
  const { t } = useTranslation();
  const { status, trigger, reset } = useAddressAutofill(fetcher, onFound);
  const run = (next: AddressLookupRowValue) => { if (enabled) trigger({ postcode: next.postalCode, number: next.houseNumber, addition: next.addition }); else reset(); };

  const changePostcode = (postalCode: string) => { onChange({ postalCode }); run({ ...value, postalCode }); };
  const changeNumber = (raw: string) => {
    // "12A" / "12-3" typed in the number field: the digits stay, the rest becomes the addition.
    const m = /^(\d{0,5})\s*[-/]?\s*([A-Za-z0-9]*)$/.exec(raw.trim());
    const houseNumber = m ? m[1] : raw.replace(/\D/g, "").slice(0, 5);
    const addition = m && m[2] ? tidyAddition(m[2]) : value.addition;
    onChange({ houseNumber, addition });
    run({ ...value, houseNumber, addition });
  };
  const changeAddition = (raw: string) => { const addition = tidyAddition(raw); onChange({ addition }); run({ ...value, addition }); };

  return (
    <div className={className}>
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-x-3">
        <div>
          <Label htmlFor={`${idPrefix}-postcode`} className="text-xs">{t("common:fields.postalCode")}</Label>
          <Input id={`${idPrefix}-postcode`} className="h-9" value={value.postalCode} placeholder="1234 AB" autoComplete="postal-code"
            onChange={(e) => changePostcode(e.target.value)} onBlur={() => { const f = formatPostcode(value.postalCode); if (f !== value.postalCode) onChange({ postalCode: f }); }}
            maxLength={10} data-testid={`${idPrefix}-postcode`} />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-number`} className="text-xs">{t("common:addressLookup.houseNumber")}</Label>
          <Input id={`${idPrefix}-number`} className="h-9" value={value.houseNumber} inputMode="numeric" autoComplete="off"
            onChange={(e) => changeNumber(e.target.value)} data-testid={`${idPrefix}-number`} />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-addition`} className="text-xs">{t("common:addressLookup.addition")}</Label>
          <Input id={`${idPrefix}-addition`} className="h-9" value={value.addition} autoComplete="off"
            onChange={(e) => changeAddition(e.target.value)} data-testid={`${idPrefix}-addition`} />
        </div>
      </div>
      <AddressLookupStatus status={status} className="mt-1.5" />
    </div>
  );
}
