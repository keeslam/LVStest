#!/bin/bash
# Volledige rerun: wacht op de E2E-server, zaai, en draai de hoofdstukken met accountwisseling.
cd "C:/Users/kees lam/Desktop/LVStest-main/LVStest-main"
export MSYS_NO_PATHCONV=1
for i in $(seq 1 120); do code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5010/api/user 2>/dev/null); [ "$code" = "401" ] && break; sleep 5; done
echo "server op"
node scripts/handleiding/seed.mjs | tail -2
rm -f docs/gebruikershandleiding/afbeeldingen/*.png scripts/handleiding/.failed-*.png
node scripts/handleiding/run.mjs --account=e2e-admin 01- 02- 03-dashboard 03- 04- 05-voertuigen 06-klanten 07-onderhoud 08-transporten 09-documenten 10-scannen 11-rapporten 12-klantenportaal
node scripts/handleiding/run.mjs --account=e2e-admin-b 05- 06- 07-
node scripts/handleiding/run.mjs --account=e2e-manager 08- 09-documenten-emailen 09-communicatie 09-ontvangen 18- 10-geschiedenis
node scripts/handleiding/run.mjs --account=e2e-manager-b 01-close 03-close 04-close 05-close 06-close 07-close 08-close 09-close 18-close
node scripts/handleiding/run.mjs --account=e2e-admin-b 09-email-gps 10-gebruikersmenu 10-gebruikersbeheer 10-app-instellingen 10-backup 15-grijze 10-geweigerde
echo "RUN KLAAR"; ls docs/gebruikershandleiding/afbeeldingen | wc -l
