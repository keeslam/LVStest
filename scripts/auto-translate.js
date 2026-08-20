import { translate } from '@vitalets/google-translate-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const CLIENT_DIR = path.join(__dirname, '../client/src');
const NL_TRANSLATION_PATH = path.join(CLIENT_DIR, 'locales/nl/translation.json');
const EN_TRANSLATION_PATH = path.join(CLIENT_DIR, 'locales/en/translation.json');

// Load existing translations
const nlTranslations = JSON.parse(fs.readFileSync(NL_TRANSLATION_PATH, 'utf8'));
const enTranslations = JSON.parse(fs.readFileSync(EN_TRANSLATION_PATH, 'utf8'));

// Categories for organizing translations
const categories = [
  'common', 'nav', 'dashboard', 'vehicles', 'customers', 'reservations',
  'expenses', 'documents', 'reports', 'notifications', 'settings', 'users',
  'auth', 'errors', 'calendar', 'maintenance', 'extensions', 'backups'
];

// Patterns to extract strings from React/TypeScript files
const stringPatterns = [
  // JSX text content: >text<
  />([^<>{}\n]+)</g,
  // String literals in JSX attributes: placeholder="text"
  /(?:placeholder|title|alt|aria-label)=["']([^"']+)["']/g,
  // Toast/alert messages: toast({ title: "text" })
  /(?:title|description|message):\s*["']([^"']+)["']/g,
];

// Patterns to EXCLUDE (don't translate these)
const excludePatterns = [
  /^[0-9\s\-\+\(\)\/\.,]+$/, // Numbers, dates, phone numbers
  /^[A-Z_]+$/, // ALL_CAPS constants
  /^\$\{/, // Template literals
  /^(http|https|www)/, // URLs
  /^[a-z]+$/i, // Single word variables
  /^[\{\}\[\]<>]/, // Brackets/tags
  /^\s*$/, // Empty or whitespace only
  /^(px|rem|em|%|ms|s)$/, // CSS units
  /^(true|false|null|undefined)$/i, // JS keywords
  /^import |from |const |let |var |function |export /, // Code
];

// Extract hardcoded strings from a file
function extractStrings(content, filePath) {
  const strings = new Set();
  
  // Skip files that already use translations
  if (content.includes("useTranslation()") || content.includes("from 'react-i18next'")) {
    console.log(`⏭️  Skipping ${filePath} - already uses i18n`);
    return [];
  }

  // Extract strings using patterns
  stringPatterns.forEach(pattern => {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const text = match[1]?.trim();
      if (text && !shouldExclude(text)) {
        strings.add(text);
      }
    }
  });

  return Array.from(strings);
}

// Check if a string should be excluded from translation
function shouldExclude(text) {
  return excludePatterns.some(pattern => pattern.test(text));
}

// Generate a translation key from text
function generateKey(text, category) {
  // Convert to camelCase key
  let key = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim()
    .split(/\s+/)
    .map((word, i) => i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  
  // Ensure key is unique within category
  let finalKey = key;
  let counter = 1;
  while (enTranslations[category]?.[finalKey]) {
    finalKey = `${key}${counter}`;
    counter++;
  }
  
  return finalKey;
}

// Determine best category for a translation
function determineCategory(filePath, text) {
  const pathLower = filePath.toLowerCase();
  
  // Check path for category hints
  for (const cat of categories) {
    if (pathLower.includes(cat)) {
      return cat;
    }
  }
  
  // Check text content for hints
  const textLower = text.toLowerCase();
  if (textLower.includes('error') || textLower.includes('failed')) return 'errors';
  if (textLower.includes('save') || textLower.includes('cancel') || textLower.includes('delete')) return 'common';
  if (textLower.includes('vehicle') || textLower.includes('car')) return 'vehicles';
  if (textLower.includes('customer') || textLower.includes('client')) return 'customers';
  if (textLower.includes('reservation') || textLower.includes('booking')) return 'reservations';
  if (textLower.includes('expense') || textLower.includes('cost')) return 'expenses';
  if (textLower.includes('user') || textLower.includes('login') || textLower.includes('password')) return 'auth';
  
  return 'common';
}

// Translate text with retry logic
async function translateText(text, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await translate(text, { from: 'en', to: 'nl' });
      return result.text;
    } catch (error) {
      if (i === retries - 1) {
        console.error(`❌ Failed to translate "${text}":`, error.message);
        return text; // Return original if all retries fail
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Process a single file
async function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const strings = extractStrings(content, filePath);
  
  if (strings.length === 0) {
    return [];
  }

  console.log(`\n📄 Processing: ${path.relative(CLIENT_DIR, filePath)}`);
  console.log(`   Found ${strings.length} strings to translate`);

  const translations = [];

  for (const text of strings) {
    const category = determineCategory(filePath, text);
    const key = generateKey(text, category);
    
    // Translate to Dutch
    console.log(`   🔄 Translating: "${text}"`);
    const dutchText = await translateText(text);
    console.log(`      → "${dutchText}"`);
    
    // Add to translations
    if (!enTranslations[category]) {
      enTranslations[category] = {};
    }
    if (!nlTranslations[category]) {
      nlTranslations[category] = {};
    }
    
    enTranslations[category][key] = text;
    nlTranslations[category][key] = dutchText;
    
    translations.push({
      category,
      key,
      en: text,
      nl: dutchText,
      original: text
    });
    
    // Rate limiting - wait between translations
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return translations;
}

// Recursively find all component files
function findComponentFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and certain directories
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'locales') {
        findComponentFiles(filePath, fileList);
      }
    } else if (file.match(/\.(tsx|ts|jsx|js)$/)) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Main function
async function main() {
  console.log('🚀 Starting automatic translation process...\n');
  
  const componentFiles = findComponentFiles(CLIENT_DIR);
  console.log(`📁 Found ${componentFiles.length} component files to scan\n`);
  
  let totalTranslations = 0;
  
  for (const filePath of componentFiles) {
    const translations = await processFile(filePath);
    totalTranslations += translations.length;
  }
  
  // Save updated translation files
  console.log('\n💾 Saving translation files...');
  fs.writeFileSync(
    EN_TRANSLATION_PATH,
    JSON.stringify(enTranslations, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    NL_TRANSLATION_PATH,
    JSON.stringify(nlTranslations, null, 2),
    'utf8'
  );
  
  console.log('\n✅ Translation process complete!');
  console.log(`📊 Total new translations added: ${totalTranslations}`);
  console.log('\n📝 Next steps:');
  console.log('1. Review the updated translation files');
  console.log('2. Update your components to use the t() function');
  console.log('3. Import useTranslation from react-i18next in each component');
  console.log('\nExample component update:');
  console.log('  import { useTranslation } from "react-i18next";');
  console.log('  const { t } = useTranslation();');
  console.log('  <Button>{t("common.save")}</Button>');
}

// Run the script
main().catch(console.error);
