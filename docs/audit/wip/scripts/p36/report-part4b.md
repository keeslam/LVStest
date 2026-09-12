
---

## 6. De twee opschoningsscripts, in proefdraaimodus

Beide scripts zijn **alleen als proefdraai** uitgevoerd, tegen `lvs_regress`. Ze schrijven niets
zonder `--apply`, en ze weigeren te schrijven buiten `lvs_fixtest` zonder een expliciete vlag.
De aanroep die nodig was op deze host:

```
DATABASE_SSL=false DATABASE_URL='postgresql://postgres:postgres@localhost:5432/lvs_regress?sslmode=disable' \
  npx tsx scripts/close-returned-reservations.ts
```

(zonder `DATABASE_SSL=false` breekt beide scripts af op "The server does not support SSL connections" —
het startscript van de server zet die variabele wel, de losse scripts niet. Dat is een kleine
bedieningsvalstrik voor wie dit ooit in productie draait.)

### 6.1 `close-returned-reservations.ts` (B-02)

```
[B-02] 4 live reservation(s) sit on 'returned'. Re-run with --apply to close them.
```

**Vier rijen.** Dat is niet wat het besluit verwacht, en dit is de belangrijkste bevinding van deze
paragraaf. `besluiten.md` B-02 zegt: *"Eenmalige bulkactie sluit de bestaande oude rijen af die nu
voertuigen blokkeren (788 rijen / 423 voertuigen in de dev-kloon)."* Het script zoekt alleen op
`status = 'returned'`, en zo veel rijen met die status zijn er niet.

De 788 uit het besluit blijken iets anders te tellen. Op dezelfde kloon:

| Telling | SQL | Uitkomst |
|---|---|---|
| Rijen met status `returned`, niet verwijderd | `status='returned' and deleted_at is null` | **4** |
| Rijen die een voertuig blokkeren: niet afgesloten, einddatum in het verleden | `deleted_at is null and status not in ('completed','cancelled') and end_date < vandaag` | **790 rijen / 417 voertuigen** |

Uitgesplitst: 380 `booked`, 363 `picked_up`, 38 `active`, 4 `returned`, 4 `scheduled`, 1 `in`.

**Gevolg:** het script zoals het er nu staat sluit **4 van de 790** blokkerende rijen af. De
eenmalige bulkactie uit B-02 is daarmee feitelijk niet geleverd. De vraag welke van die 790 rijen
afgesloten mogen worden — een `picked_up`-rij uit 2024 is iets anders dan een `booked`-rij van
vorige week — is een eigenaarsbeslissing die nog niet gesteld is. Dit rapport verandert niets; het
meldt alleen dat het getal in het besluit en het getal in het script niet hetzelfde meten.

### 6.2 `normalize-license-plates.ts` (B-10)

```
[B-10] geen botsingen. 11 voertuig(en) staan niet in genormaliseerde vorm.
Draai opnieuw met --apply om ze op te schonen en de unieke index te plaatsen.
```

Die 11 zijn **alle elf testvoertuigen van deze fase** (`P36A-V1-…`, `P36C-A` … `P36C-H`). Op de
onaangeroerde, productievormige kloon is het antwoord schoon:

| Telling op `lvstest` (alleen gelezen, niets gewijzigd) | Uitkomst |
|---|---|
| Voertuigen | 499 |
| Kentekens die na normalisatie veranderen | **0** |
| Groepen die na normalisatie samenvallen (botsingen) | **0** |

**Dat is het antwoord op de vraag die B-10 vooraf stelde.** Er zijn geen voertuigen die na
normalisatie samenvallen, dus de opschoning en de unieke index kunnen zonder samenvoegingsbesluit
geplaatst worden. Het script stopt correct bij botsingen; er zijn er geen.

Eén losse waarneming die hier bij hoort: BUG-157 (contractnummers met en zonder voorloopnul naast
elkaar) staat nog open, en in `lvs_regress` zijn **drie** zulke botsingsgroepen. Dat is een andere
kolom dan het kenteken en valt buiten dit script.
