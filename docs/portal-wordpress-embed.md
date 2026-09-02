# Klantenportaal insluiten op lamgroep.nl

Het portaal draait in de beheerapp en wordt op de website in een iframe getoond.

## Vereisten

1. De beheerapp is bereikbaar op een subdomein van de website, bijvoorbeeld
   `https://portaal.lamgroep.nl`. Dit is nodig omdat browsers cookies in een
   iframe van een *ander* domein blokkeren; een subdomein telt als hetzelfde.
2. In de beheerapp, Instellingen > Klantenportaal:
   - Toegestane website-adressen: `https://lamgroep.nl` en `https://www.lamgroep.nl`
     (lokaal ook `http://lamgroep.local`).
   - Basis-URL van het portaal: `https://portaal.lamgroep.nl`.
   - E-mailadres voor meldingen.

## Pagina "Klantenportaal" in WordPress

Plaats dit in een HTML-blok (of in het thema-template van die pagina):

```html
<iframe id="lamgroep-portal" src="https://portaal.lamgroep.nl/portaal"
        style="width:100%;border:0;min-height:600px" title="Klantenportaal"></iframe>
<script>
window.addEventListener('message', function (e) {
  if (e.origin !== 'https://portaal.lamgroep.nl') return;
  if (e.data && e.data.type === 'lamgroep-portal:height') {
    document.getElementById('lamgroep-portal').style.height = e.data.height + 'px';
  }
});
</script>
```

Het portaal stuurt zijn hoogte naar de pagina, zodat er geen tweede scrollbalk
ontstaat. Uitnodigingsmails linken rechtstreeks naar
`https://portaal.lamgroep.nl/portaal/activeren?token=…`; die pagina werkt ook
buiten het iframe.

## Lokaal testen

`scripts/portal-iframe-test.html` is een testpagina die het portaal in een
iframe laadt. Serveer hem op een andere poort (bijvoorbeeld
`npx serve scripts -l 8099`) en voeg `http://localhost:8099` toe aan de
toegestane website-adressen.
