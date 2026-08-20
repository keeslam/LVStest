# Translation Guide - Using AI to Automate

## Quick 3-Step Process

### Step 1: Copy Component File
Copy the entire content of any component file you want to translate.

Example files to translate:
- `client/src/pages/vehicles/index.tsx`
- `client/src/pages/reservations/index.tsx`
- `client/src/pages/expenses/index.tsx`
- Any component in `client/src/components/`

### Step 2: Use This Exact Prompt with ChatGPT/Claude

```
Convert this React component to use i18next translations:

1. Add this import at the top:
   import { useTranslation } from 'react-i18next';

2. Add this line in the component function:
   const { t } = useTranslation();

3. Replace ALL hardcoded English text with t('category.key') format:
   - Button text: "Delete" → {t('common.delete')}
   - Headings: "Customer Management" → {t('customers.title')}
   - Placeholders: placeholder="Search..." → placeholder={t('common.search')}
   - Table headers: "Name" → {t('common.name')}

4. Use these categories:
   - common: delete, save, cancel, edit, add, search, loading, etc.
   - vehicles: vehicle-specific text
   - customers: customer-specific text
   - reservations: reservation-specific text
   - expenses: expense-specific text
   - auth: login-related text

5. Keep: variable names, classNames, data-testid attributes, comments

Here's the component:
[PASTE YOUR COMPONENT CODE HERE]
```

### Step 3: Add Translations to JSON Files

After ChatGPT gives you the converted component:

1. **Copy the new component code** and paste it back into your file
2. **Look for new translation keys** (anything with `t('...')`)
3. **Add missing keys** to BOTH translation files:
   - `client/src/locales/nl/translation.json` (Dutch)
   - `client/src/locales/en/translation.json` (English)

## Example

**Before:**
```tsx
<h1 className="text-2xl font-bold">Vehicle Management</h1>
<Button>Add Vehicle</Button>
```

**After ChatGPT:**
```tsx
import { useTranslation } from 'react-i18next';

export default function VehiclesPage() {
  const { t } = useTranslation();
  
  return (
    <>
      <h1 className="text-2xl font-bold">{t('vehicles.title')}</h1>
      <Button>{t('vehicles.addVehicle')}</Button>
    </>
  );
}
```

**Then add to JSON files:**
```json
// nl/translation.json
{
  "vehicles": {
    "title": "Voertuigbeheer",
    "addVehicle": "Voertuig Toevoegen"
  }
}

// en/translation.json
{
  "vehicles": {
    "title": "Vehicle Management",
    "addVehicle": "Add Vehicle"
  }
}
```

## Translation Categories Already Available

These categories are already set up with many translations:
- `common` - buttons, actions, status words
- `nav` - navigation menu items
- `dashboard` - dashboard widgets
- `vehicles` - vehicle management
- `customers` - customer management
- `reservations` - reservations
- `expenses` - expenses
- `auth` - login/authentication

Check existing translations in `client/src/locales/nl/translation.json` before adding duplicates!

## Pro Tips

1. **Start with most-used pages** (vehicles, reservations, expenses)
2. **Reuse existing translation keys** when possible
3. **Keep keys consistent** (use camelCase: addVehicle, not add-vehicle)
4. **Test immediately** after translating each page
5. **Ask ChatGPT to generate both Dutch and English** translations if needed

## Need Help with Dutch Translations?

You can also ask ChatGPT:
```
Translate these English UI texts to Dutch (Netherlands):
- "Vehicle Management" 
- "Add New Vehicle"
- "Search by license plate..."

Provide professional, concise UI translations.
```

---

That's it! You can now translate pages in ~2 minutes each using ChatGPT/Claude.
