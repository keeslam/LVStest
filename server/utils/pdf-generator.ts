/**
 * PDF generation utility to create rental contracts
 * Using the ELENA AVL ALL contract template or custom templates
 */

import { Reservation, PdfTemplate, VehicleTransport, TransportReportTemplate } from "../../shared/schema";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, rgb, StandardFonts, TextAlignment } from 'pdf-lib';

/**
 * Format a license plate consistently throughout the application
 * Removes dashes and spaces, then formats according to Dutch license plate standards
 */
function formatLicensePlate(licensePlate: string): string {
  // Remove any existing dashes or spaces and convert to uppercase
  const sanitized = licensePlate.replace(/[-\s]/g, '').toUpperCase();
  
  // Standard Dutch license plate formats
  const formats = [
    { pattern: /^([A-Z]{2})(\d{2})(\d{2})$/, format: '$1-$2-$3' }, // XX-00-00
    { pattern: /^(\d{2})(\d{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // 00-00-XX
    { pattern: /^(\d{2})([A-Z]{2})(\d{2})$/, format: '$1-$2-$3' }, // 00-XX-00
    { pattern: /^([A-Z]{2})([A-Z]{2})(\d{2})$/, format: '$1-$2-$3' }, // XX-XX-00
    { pattern: /^([A-Z]{2})(\d{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // XX-00-XX
    { pattern: /^(\d{2})([A-Z]{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // 00-XX-XX
    { pattern: /^([A-Z])(\d{3})([A-Z]{2})$/, format: '$1-$2-$3' }, // X-000-XX
    { pattern: /^([A-Z]{2})(\d{3})([A-Z])$/, format: '$1-$2-$3' }, // XX-000-X
    { pattern: /^([A-Z])(\d{2})([A-Z]{3})$/, format: '$1-$2-$3' }, // X-00-XXX
    { pattern: /^([A-Z]{3})(\d{2})([A-Z])$/, format: '$1-$2-$3' }, // XXX-00-X
    { pattern: /^(\d{1})([A-Z]{3})(\d{2})$/, format: '$1-$2-$3' }, // 0-XXX-00
    { pattern: /^(\d{2})([A-Z]{3})(\d{1})$/, format: '$1-$2-$3' }, // 00-XXX-0
  ];
  
  // Try to match and format the license plate
  for (const { pattern, format } of formats) {
    if (pattern.test(sanitized)) {
      return sanitized.replace(pattern, format);
    }
  }
  
  // If no standard format matches, return as-is (already uppercase)
  return sanitized;
}

/**
 * Generates a rental contract PDF using a custom template
 * @param reservation Reservation data
 * @param template Optional PDF template. If not provided, the default template will be used.
 */
export async function generateRentalContractFromTemplate(reservation: Reservation, template?: PdfTemplate): Promise<Buffer> {
  try {
    // Extract data for the contract
    const contractData = prepareContractData(reservation);
    
    // Check if a template background exists
    let pdfDoc;
    let page;
    
    // Only use preview mode if explicitly requested (not just when id is 0)
    const previewMode = false; // Disable preview mode - always use actual data
    if (previewMode) {
      console.log('Preview mode enabled - using sample data for fields');
    }
    
    // Always try to use the template background
    try {
      // Use custom background if specified in template, otherwise use default
      const backgroundPath = template?.backgroundPath || 'uploads/templates/rental_contract_template.pdf';
      const defaultTemplatePath = path.join(process.cwd(), 'uploads/templates/rental_contract_template.pdf');
      
      console.log('Loading template from path:', backgroundPath);
      
      let templateBytes: Buffer;
      let ext: string;
      
      // Check if path is object storage (starts with /) or local filesystem
      if (backgroundPath.startsWith('/')) {
        // Object storage path
        console.log('Loading background from object storage');
        const { ObjectStorageService } = await import('../objectStorage');
        const objStorageService = new ObjectStorageService();
        const file = objStorageService.getFile(backgroundPath);
        const [fileBuffer] = await file.download();
        templateBytes = Buffer.from(fileBuffer);
        ext = path.extname(backgroundPath).toLowerCase();
        console.log('Successfully loaded background from object storage');
      } else {
        // Local filesystem path
        const templatePath = path.join(process.cwd(), backgroundPath);
        if (fs.existsSync(templatePath)) {
          templateBytes = fs.readFileSync(templatePath);
          ext = path.extname(templatePath).toLowerCase();
        } else {
          throw new Error('Local template file not found');
        }
      }
      
      // Process the loaded template bytes
      if (templateBytes) {
        
        // Handle PDF files
        if (ext === '.pdf') {
          try {
            // Load the PDF document
            pdfDoc = await PDFDocument.load(templateBytes);
            
            // Get the first page or add one if the PDF is empty
            if (pdfDoc.getPageCount() > 0) {
              page = pdfDoc.getPage(0);
              console.log('Successfully loaded PDF template background');
            } else {
              console.log('Template PDF exists but has no pages, falling back to default');
              throw new Error('PDF has no pages');
            }
          } catch (pdfError) {
            console.error('Error loading PDF template, falling back to default:', pdfError);
            // Fall back to default template
            if (fs.existsSync(defaultTemplatePath)) {
              const defaultBytes = fs.readFileSync(defaultTemplatePath);
              pdfDoc = await PDFDocument.load(defaultBytes);
              page = pdfDoc.getPage(0);
            } else {
              pdfDoc = await PDFDocument.create();
              page = pdfDoc.addPage([595, 842]);
            }
          }
        } 
        // Handle image files (JPG, PNG)
        else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
          console.log('Custom background is an image, creating new PDF and embedding image');
          
          try {
            // Create new document for image background
            pdfDoc = await PDFDocument.create();
            page = pdfDoc.addPage([595, 842]); // A4 size
            
            // Embed the image based on type
            let image;
            if (ext === '.png') {
              image = await pdfDoc.embedPng(templateBytes);
            } else {
              image = await pdfDoc.embedJpg(templateBytes);
            }
            
            // Draw the image to fill the page
            const { width, height } = page.getSize();
            page.drawImage(image, {
              x: 0,
              y: 0,
              width: width,
              height: height,
            });
            console.log('Successfully embedded image background');
          } catch (imgError) {
            console.error('Error embedding image, falling back to default template:', imgError);
            // Fall back to default template - reload completely
            if (fs.existsSync(defaultTemplatePath)) {
              const defaultBytes = fs.readFileSync(defaultTemplatePath);
              pdfDoc = await PDFDocument.load(defaultBytes);
              page = pdfDoc.getPage(0);
              console.log('Successfully loaded default template after image failure');
            } else {
              console.error('CRITICAL: Default template not found after image failure');
              pdfDoc = await PDFDocument.create();
              page = pdfDoc.addPage([595, 842]);
            }
          }
        } else {
          console.log('Unsupported file type, falling back to default template');
          // Fall back to default template
          if (fs.existsSync(defaultTemplatePath)) {
            const defaultBytes = fs.readFileSync(defaultTemplatePath);
            pdfDoc = await PDFDocument.load(defaultBytes);
            page = pdfDoc.getPage(0);
          } else {
            pdfDoc = await PDFDocument.create();
            page = pdfDoc.addPage([595, 842]);
          }
        }
      } else {
        console.log('Custom template file not found, falling back to default');
        // Fall back to default template
        if (fs.existsSync(defaultTemplatePath)) {
          const defaultBytes = fs.readFileSync(defaultTemplatePath);
          pdfDoc = await PDFDocument.load(defaultBytes);
          page = pdfDoc.getPage(0);
          console.log('Successfully loaded default template background');
        } else {
          console.log('Default template also not found, creating blank document');
          pdfDoc = await PDFDocument.create();
          page = pdfDoc.addPage([595, 842]); // A4 size
        }
      }
    } catch (error) {
      console.error('Error loading template background:', error);
      // Final fallback - try default template one more time
      try {
        const defaultTemplatePath = path.join(process.cwd(), 'uploads/templates/rental_contract_template.pdf');
        if (fs.existsSync(defaultTemplatePath)) {
          const defaultBytes = fs.readFileSync(defaultTemplatePath);
          pdfDoc = await PDFDocument.load(defaultBytes);
          page = pdfDoc.getPage(0);
          console.log('Recovered using default template');
        } else {
          pdfDoc = await PDFDocument.create();
          page = pdfDoc.addPage([595, 842]); // A4 size
        }
      } catch (fallbackError) {
        console.error('Final fallback also failed:', fallbackError);
        pdfDoc = await PDFDocument.create();
        page = pdfDoc.addPage([595, 842]); // A4 size
      }
    }
    
    // Get fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Default text color
    const textColor = rgb(0, 0, 0);
    
    // If template is provided, process template fields
    if (template && template.fields) {
      console.log('Processing template fields');
      
      // Parse fields - they could be in various formats from the database
      let fields = [];
      try {
        console.log(`Template fields type: ${typeof template.fields}`);
        console.log(`Template fields raw value:`, template.fields);
        
        if (template.fields === null || template.fields === undefined) {
          console.log(`Template fields is null or undefined`);
          fields = [];
        } else if (typeof template.fields === 'string') {
          // Handle various string formats that could come from the database
          let fieldsString = template.fields;
          
          // Detect if it's a double-stringified JSON (common database storage issue)
          if (fieldsString.startsWith('"[') && fieldsString.endsWith(']"')) {
            // Remove outer quotes and unescape inner quotes
            fieldsString = fieldsString.substring(1, fieldsString.length - 1).replace(/\\"/g, '"');
          }
          
          // Now parse the JSON string
          try {
            fields = JSON.parse(fieldsString);
            console.log(`Successfully parsed fields string, found ${fields.length} fields`);
          } catch (parseError) {
            console.error('Error parsing fields string:', parseError);
            console.log('Fields string was:', fieldsString);
            fields = [];
          }
        } else if (Array.isArray(template.fields)) {
          // Already an array
          fields = template.fields;
          console.log(`Fields is already an array with ${fields.length} items`);
        } else if (typeof template.fields === 'object') {
          // Try to convert object to array
          console.log(`Fields is an object, trying to convert`);
          if (Object.keys(template.fields).length > 0) {
            // Try to extract as array
            const fieldsArray = Object.values(template.fields);
            if (Array.isArray(fieldsArray)) {
              fields = fieldsArray;
              console.log(`Converted fields object to array with ${fields.length} items`);
            }
          }
        }
        
        console.log(`Found ${fields.length} fields to render:`, fields);
      } catch (error) {
        console.error('Error processing template fields:', error);
        fields = [];
      }
      
      // Draw each field
      for (const field of fields) {
        try {
          // Get the field value from the contract data based on the source
          let value = '';
          
          // Use field name or source as placeholder in preview mode
          if (previewMode) {
            // For preview mode, use the field name to clearly identify the field position
            value = field.name || field.source || 'Field';
          } else {
            // Parse complex property paths like "customer.name" or "vehicle.brand"
            const source = field.source || '';
            
            console.log(`Processing field ${field.name} with source ${source}`);
            
            if (source.includes('.')) {
              // Handle nested properties like "customer.name" or "vehicle.brand"
              const [objectName, propertyName] = source.split('.');
              
              console.log(`Processing field with source "${source}" - object: ${objectName}, property: ${propertyName}`);
              
              if (objectName === 'customer') {
                if (propertyName === 'name') value = contractData.customerName;
                else if (propertyName === 'address') value = contractData.customerAddress;
                else if (propertyName === 'city') value = contractData.customerCity;
                else if (propertyName === 'postalCode') value = contractData.customerPostalCode;
                else if (propertyName === 'phone') value = contractData.customerPhone;
                else if (propertyName === 'driverLicenseNumber') value = contractData.driverLicense;
              } else if (objectName === 'vehicle') {
                if (propertyName === 'licensePlate') value = contractData.licensePlate;
                else if (propertyName === 'brand') value = contractData.brand;
                else if (propertyName === 'model') value = contractData.model;
                else if (propertyName === 'chassisNumber') value = contractData.chassisNumber;
              } else if (objectName === 'reservation') {
                if (propertyName === 'startDate') value = contractData.startDate;
                else if (propertyName === 'endDate') value = contractData.endDate;
                else if (propertyName === 'duration') value = contractData.duration;
                else if (propertyName === 'totalPrice') value = contractData.totalPrice;
              } else if (objectName === 'driver') {
                if (propertyName === 'name') value = contractData.driverName;
                else if (propertyName === 'firstName') value = contractData.driverFirstName;
                else if (propertyName === 'lastName') value = contractData.driverLastName;
                else if (propertyName === 'email') value = contractData.driverEmail;
                else if (propertyName === 'phone') value = contractData.driverPhone;
                else if (propertyName === 'licenseNumber') value = contractData.driverLicenseNumber;
                else if (propertyName === 'licenseExpiry') value = contractData.driverLicenseExpiry;
              }
              
              // If value is still empty, check direct properties as a fallback
              if (!value) {
                console.log(`  Field value not found in nested objects, trying direct properties...`);
                try {
                  // Safely check if the property exists in contractData
                  if (source in contractData) {
                    value = String(contractData[source as keyof typeof contractData]);
                    console.log(`  Found direct property ${source}`);
                  } else if (propertyName in contractData) {
                    value = String(contractData[propertyName as keyof typeof contractData]);
                    console.log(`  Found direct property ${propertyName}`);
                  }
                } catch (error) {
                  console.error(`Error accessing property ${source}:`, error);
                }
              }
            } else {
              // Handle direct properties (backward compatibility)
              if (source === 'customerName') value = contractData.customerName;
              else if (source === 'customerAddress') value = contractData.customerAddress;
              else if (source === 'customerCity') value = contractData.customerCity;
              else if (source === 'customerPostalCode') value = contractData.customerPostalCode;
              else if (source === 'customerPhone') value = contractData.customerPhone;
              else if (source === 'driverLicense') value = contractData.driverLicense;
              else if (source === 'driverName') value = contractData.driverName;
              else if (source === 'driverFirstName') value = contractData.driverFirstName;
              else if (source === 'driverLastName') value = contractData.driverLastName;
              else if (source === 'driverEmail') value = contractData.driverEmail;
              else if (source === 'driverPhone') value = contractData.driverPhone;
              else if (source === 'driverLicenseNumber') value = contractData.driverLicenseNumber;
              else if (source === 'driverLicenseExpiry') value = contractData.driverLicenseExpiry;
              else if (source === 'contractNumber') value = contractData.contractNumber;
              else if (source === 'contractDate') value = contractData.contractDate;
              else if (source === 'licensePlate') value = contractData.licensePlate;
              else if (source === 'brand') value = contractData.brand;
              else if (source === 'model') value = contractData.model;
              else if (source === 'chassisNumber') value = contractData.chassisNumber;
              else if (source === 'startDate') value = contractData.startDate;
              else if (source === 'endDate') value = contractData.endDate;
              else if (source === 'duration') value = contractData.duration;
              else if (source === 'totalPrice') value = contractData.totalPrice;
              // Direct access to contract data properties with type safety
              else if (source in contractData) {
                value = String(contractData[source as keyof typeof contractData]);
              }
              else if (field.name) value = field.name; // Use name as fallback
              else value = source || 'Field'; // Second fallback
            }
          }
          
          // Log in preview mode to help with debugging
          if (previewMode) {
            console.log(`Rendering preview field at position (${field.x}, ${field.y})`);
          }
          
          // Ensure we have a value to display
          // If no value, use empty string for cleaner appearance
          if (!value) {
            value = '';
          }
          
          // Determine text alignment
          let textAlignment: TextAlignment = TextAlignment.Left;
          if (field.textAlign === 'center') textAlignment = TextAlignment.Center;
          else if (field.textAlign === 'right') textAlignment = TextAlignment.Right;
          
          // Draw the text field with proper alignment
          // Ensure we're using exact coordinates as provided in the template editor
          // This is crucial as coordinates might be stored in different formats
          
          // Parse numerical values strictly to ensure we get the exact positions
          let x = 0;
          let y = 0;
          let fontSize = 12;
          
          // Handle string or number coordinates
          if (typeof field.x === 'string') {
            x = parseFloat(field.x);
          } else if (typeof field.x === 'number') {
            x = field.x;
          }
          
          if (typeof field.y === 'string') {
            y = parseFloat(field.y);
          } else if (typeof field.y === 'number') {
            y = field.y;
          }
          
          if (typeof field.fontSize === 'string') {
            fontSize = parseFloat(field.fontSize);
          } else if (typeof field.fontSize === 'number') {
            fontSize = field.fontSize;
          }
          
          // If we somehow get NaN values, use safe defaults
          if (isNaN(x)) x = 0;
          if (isNaN(y)) y = 0;
          if (isNaN(fontSize) || fontSize <= 0) fontSize = 12;
          
          console.log(`Field: ${field.name || field.source} - Original positions: X=${field.x} (${typeof field.x}), Y=${field.y} (${typeof field.y})`);
          console.log(`Parsed to X=${x}, Y=${y}, fontSize=${fontSize}`);
          
          // Get the font for this field
          const font = field.isBold ? helveticaBold : helveticaFont;
          
          // Editor uses padding: 1px vertical, 6px horizontal
          const paddingX = 6;
          const paddingY = 1;
          
          // Calculate font metrics for proper baseline positioning
          // The editor positions text from top-left, but PDF uses baseline
          const fontHeight = font.heightAtSize(fontSize);
          const ascent = fontHeight * 0.85; // Approximate ascent (distance from baseline to top)
          
          // Adjust coordinates to match editor preview:
          // - Add horizontal padding
          // - Convert from top-left to baseline positioning
          // - Account for PDF's bottom-left origin (842 - y)
          let adjustedX = x + paddingX;
          let adjustedY = 842 - y - paddingY - ascent;
          
          // Handle text alignment (pdf-lib doesn't support alignment natively in drawText)
          // The editor uses flexbox justifyContent, we need to replicate that behavior
          const textWidth = font.widthOfTextAtSize(value, fontSize);
          if (field.textAlign === 'center') {
            // For center alignment, x is the center point, so subtract half the text width
            adjustedX = x - (textWidth / 2);
          } else if (field.textAlign === 'right') {
            // For right alignment, x is the right edge, so subtract full text width plus padding
            adjustedX = x - textWidth - paddingX;
          }
          
          // Use adjusted coordinates that match the template editor preview
          const options: any = {
            x: adjustedX,
            y: adjustedY,
            size: fontSize,
            font: font,
            color: previewMode ? rgb(0, 0.4, 0.8) : textColor // Use blue color for preview mode to make fields stand out
          };
          
          // For preview mode, add a visual indicator of field boundaries
          if (previewMode) {
            // Draw a light rectangle around the field to make it more visible
            try {
              // Calculate text width for preview highlighting
              const textWidth = font.widthOfTextAtSize(value, fontSize);
              const textHeight = fontSize * 1.2;
              
              // Draw rectangle with slight padding
              page.drawRectangle({
                x: options.x - 2,
                y: options.y - 2,
                width: textWidth + 4,
                height: textHeight,
                borderColor: rgb(0.7, 0.7, 0.9),
                borderWidth: 0.5,
                color: rgb(0.95, 0.95, 1),
                opacity: 0.3
              });
            } catch (error) {
              console.error('Error drawing field highlight:', error);
            }
          }
          
          console.log(`Drawing field: ${field.label || field.source} at position (${options.x}, ${options.y}), align: ${field.textAlign || 'left'}`);
          page.drawText(value, options);
        } catch (error) {
          console.error(`Error drawing field ${field.label || field.source}:`, error);
        }
      }
    } else {
      console.log('No template fields found');
    }
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Return the PDF as a buffer
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error generating PDF contract from template:', error);
    // If there's an error, return a simple text-based contract as a fallback
    const contractData = prepareContractData(reservation);
    return generateFallbackContract(contractData);
  }
}

/**
 * Generates a rental contract PDF based on the ELENA AVL ALL contract template
 * Uses the uploaded template PDF and fills in the data according to the form layout
 */
export async function generateRentalContract(reservation: Reservation): Promise<Buffer> {
  try {
    // Extract data for the contract
    const contractData = prepareContractData(reservation);
    
    // Load the template PDF
    const templatePath = path.join(process.cwd(), 'uploads/templates/rental_contract_template.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(templateBytes);
    
    // Get the first page
    const page = pdfDoc.getPage(0);
    
    // Get fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Set drawing parameters
    const fontSize = 9;
    const textColor = rgb(0, 0, 0);
    
    // Based on the ELENA AVL ALL contract template structure
    
    // First section - Gegevens voertuig (Vehicle details)
    
    // Merk (Brand)
    page.drawText(contractData.brand, {
      x: 55,
      y: 150,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Type (Model)
    page.drawText(contractData.model, {
      x: 55,
      y: 165,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Kenteken (License plate)
    page.drawText(contractData.licensePlate, {
      x: 55,
      y: 179,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Customer section - Huurder (Renter)
    
    // Naam (Name)
    page.drawText(contractData.customerName, {
      x: 55,
      y: 254,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Adres (Address)
    page.drawText(contractData.customerAddress, {
      x: 55,
      y: 268,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Postcode (Postal code)
    page.drawText(contractData.customerPostalCode, {
      x: 55,
      y: 282,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Plaats (City)
    page.drawText(contractData.customerCity, {
      x: 55,
      y: 296,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Land (Country)
    page.drawText("Nederland", {
      x: 95,
      y: 313,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Telefoon (Phone)
    page.drawText(contractData.customerPhone, {
      x: 58,
      y: 328,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Driver's license
    page.drawText(contractData.driverLicense, {
      x: 100,
      y: 358,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Right column - Voorwaarden (Terms)
    
    // Huurtijd van-tot (Rental period from-to) - van datum
    page.drawText(contractData.startDate, {
      x: 405,
      y: 149,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // tot datum (to date)
    page.drawText(contractData.endDate, {
      x: 545,
      y: 149,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Price section
    if (reservation.totalPrice) {
      // Total price
      page.drawText(contractData.totalPrice, {
        x: 508,
        y: 236,
        size: fontSize,
        font: helveticaBold,
        color: textColor,
      });
    }
    
    // Date at the bottom - Today's date for signature
    page.drawText(contractData.contractDate, {
      x: 138,
      y: 637,
      size: fontSize,
      font: helveticaFont,
      color: textColor,
    });
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Return the PDF as a buffer
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error generating PDF contract:', error);
    // If there's an error, return a simple text-based contract as a fallback
    const contractData = prepareContractData(reservation);
    return generateFallbackContract(contractData);
  }
}

/**
 * Generate a fallback text-based contract if PDF generation fails
 */
function generateFallbackContract(contractData: any): Buffer {
  const contractTemplate = `
Auto Lease LAM
Kerkweg 47a
3214 VC Zuidland
Tel. 0181-451040
Fax 0181-453386
info@autobedrijflam.nl

- ABN AMRO 428621783
- RABOBANK 375915605
- Ook mogelijk met Creditcard, VISA of MASTERCARD te betalen

RENTAL CONTRACT

Contract Number: ${contractData.contractNumber}
Date: ${contractData.contractDate}

VEHICLE INFORMATION:
License Plate: ${contractData.licensePlate}
Brand: ${contractData.brand}
Model: ${contractData.model}
Chassis Number: ${contractData.chassisNumber}

CUSTOMER INFORMATION:
Name: ${contractData.customerName}
Address: ${contractData.customerAddress}
City: ${contractData.customerCity} ${contractData.customerPostalCode}
Phone: ${contractData.customerPhone}
Driver License: ${contractData.driverLicense}

RENTAL PERIOD:
Start Date: ${contractData.startDate}
End Date: ${contractData.endDate}
Duration: ${contractData.duration}

RENTAL PRICE:
Total Price: ${contractData.totalPrice}

TERMS AND CONDITIONS:
1. The vehicle must be returned in the same condition as at the start of the rental period.
2. The renter is responsible for any damage to the vehicle during the rental period.
3. The vehicle must not be used for illegal purposes.
4. The vehicle must not be driven outside of the Netherlands without prior permission.
5. The vehicle must be returned with the same amount of fuel as at the start of the rental period.

SIGNATURES:

Auto Lease LAM: ___________________

Customer: _________________________

Date: ${contractData.contractDate}
`;

  return Buffer.from(contractTemplate);
}

/**
 * Prepare contract data from reservation
 */
export function prepareContractData(reservation: Reservation) {
  const vehicle = reservation.vehicle || {
    licensePlate: "",
    brand: "",
    model: "",
    chassisNumber: "",
  };
  
  const customer = reservation.customer || {
    name: "",
    address: "",
    city: "",
    postalCode: "",
    phone: "",
    driverLicenseNumber: "",
  };
  
  // Extract driver information if available
  const driver = (reservation as any).driver || null;
  const driverName = driver?.displayName || "";
  const driverFirstName = driver?.firstName || "";
  const driverLastName = driver?.lastName || "";
  const driverEmail = driver?.email || "";
  const driverPhone = driver?.phone || "";
  const driverLicenseNumber = driver?.driverLicenseNumber || "";
  const driverLicenseExpiry = driver?.licenseExpiry || "";
  
  // Calculate duration in days
  const startDate = new Date(reservation.startDate);
  const endDate = reservation.endDate && reservation.endDate.trim() !== '' 
    ? new Date(reservation.endDate) 
    : null;
  
  let diffDays = 1; // Default to 1 day
  if (endDate && !isNaN(endDate.getTime())) {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // Parse totalPrice as a number if it's a string
  const totalPrice = typeof reservation.totalPrice === 'string' 
    ? parseFloat(reservation.totalPrice) 
    : reservation.totalPrice;
  
  return {
    contractNumber: reservation.contractNumber || `C-${reservation.id}-${format(new Date(), 'yyyyMMdd')}`,
    contractDate: format(new Date(), 'd MMMM yyyy', { locale: nl }),
    licensePlate: formatLicensePlate(vehicle.licensePlate),
    brand: vehicle.brand,
    model: vehicle.model,
    chassisNumber: vehicle.chassisNumber || "",
    customerName: customer.name,
    customerAddress: customer.address || "",
    customerCity: customer.city || "",
    customerPostalCode: customer.postalCode || "",
    customerPhone: customer.phone || "",
    driverLicense: customer.driverLicenseNumber || "",
    driverName,
    driverFirstName,
    driverLastName,
    driverEmail,
    driverPhone,
    driverLicenseNumber,
    driverLicenseExpiry,
    startDate: format(startDate, 'MMMM d, yyyy'),
    endDate: endDate ? format(endDate, 'MMMM d, yyyy') : 'To be determined',
    duration: `${diffDays} day${diffDays !== 1 ? 's' : ''}`,
    totalPrice: formatCurrency(totalPrice),
    vehicleId: reservation.vehicleId || 0,  // Add vehicleId for document cache invalidation
  };
}

/**
 * Format a value as currency (Euro)
 * Handles number, string, null, or undefined
 */
function formatCurrency(amount: any): string {
  if (amount === null || amount === undefined) {
    return '€0.00';
  }
  
  // Convert to number if it's a string
  const numericAmount = typeof amount === 'string' 
    ? parseFloat(amount.replace(/[^\d.-]/g, '')) 
    : amount;
  
  // If it's NaN after conversion, return zero
  if (isNaN(numericAmount)) {
    return '€0.00';
  }
  
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numericAmount);
}

/**
 * Helper: Draw a rectangle border
 */
function drawBox(page: any, x: number, y: number, width: number, height: number, lineWidth = 1) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0, 0, 0),
    borderWidth: lineWidth,
  });
}

/**
 * Helper: Draw a filled rectangle header
 */
function drawFilledHeader(page: any, x: number, y: number, width: number, height: number, text: string, font: any, fontSize = 10) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(0.2, 0.3, 0.6),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });
  page.drawText(text, {
    x: x + 5,
    y: y + (height / 2) - (fontSize / 2),
    size: fontSize,
    font,
    color: rgb(1, 1, 1),
  });
}

/**
 * Helper: Draw checkbox with label
 */
function drawCheckbox(page: any, x: number, y: number, label: string, value: any, font: any) {
  // Checkbox
  page.drawRectangle({
    x,
    y,
    width: 10,
    height: 10,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
  
  // If checked, draw X
  if (value) {
    page.drawText('X', {
      x: x + 2,
      y: y + 2,
      size: 8,
      font,
    });
  }
  
  // Label
  page.drawText(label, {
    x: x + 14,
    y: y + 1,
    size: 9,
    font,
  });
}

/**
 * Generate a PDF for an interactive damage check - Dutch format
 * Matches professional rental damage check form layout
 */
export async function generateInteractiveDamageCheckPDF(damageCheck: any, vehicle?: any): Promise<Buffer> {
  try {
    console.log('Generating interactive damage check PDF for check:', damageCheck.id);
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add first page - A4 size
    const page = pdfDoc.addPage([595, 842]);
    const { width, height} = page.getSize();
    
    // Layout constants - more compact
    const margin = 15;
    const columnWidth = (width - margin * 2 - 140) / 3; // 3 columns + right sidebar (wider columns)
    const sidebarWidth = 130;
    const sidebarX = width - margin - sidebarWidth;
    
    let y = height - margin;
    
    // ===== HEADER SECTION =====
    // Logo placeholder (left)
    page.drawText('LAM GROUP', {
      x: margin,
      y: y - 15,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0.2, 0.6),
    });
    
    // Date field (top right)
    page.drawText('Datum:', {
      x: sidebarX - 80,
      y: y - 10,
      size: 9,
      font: helveticaFont,
    });
    drawBox(page, sidebarX, y - 20, sidebarWidth, 15);
    const checkDate = damageCheck.checkDate ? format(new Date(damageCheck.checkDate), 'dd-MM-yyyy') : '--';
    page.drawText(checkDate, {
      x: sidebarX + 5,
      y: y - 17,
      size: 9,
      font: helveticaFont,
    });
    
    // Contract number field
    y -= 25;
    page.drawText('Verhuurcontractnummer:', {
      x: sidebarX - 80,
      y: y - 10,
      size: 8,
      font: helveticaFont,
    });
    drawBox(page, sidebarX, y - 20, sidebarWidth, 15);
    const contractRef = `DC-${damageCheck.id || 'TEMP'}`;
    page.drawText(contractRef, {
      x: sidebarX + 5,
      y: y - 17,
      size: 9,
      font: helveticaFont,
    });
    
    y -= 35;
    
    // ===== CHECKLIST COLUMNS =====
    const checklistY = y;
    const checklistHeight = 280; // More compact height
    
    // Parse checklist data with error handling
    let checklistData = { interior: {}, exterior: {}, delivery: {} };
    if (damageCheck.checklistData) {
      try {
        checklistData = typeof damageCheck.checklistData === 'string' 
          ? JSON.parse(damageCheck.checklistData) 
          : damageCheck.checklistData;
      } catch (err) {
        console.error('Error parsing checklist data:', err);
      }
    }
    
    // INTERIEUR COLUMN
    let colY = checklistY;
    drawFilledHeader(page, margin, colY, columnWidth, 20, 'Interieur', helveticaBold, 11);
    colY -= 25;
    const interiorItems = [
      ['carInterior', 'Binnenzijde auto'],
      ['floorMats', 'Vloermatten'],
      ['upholstery', 'Bekleding'],
      ['ashtray', 'Asbak'],
      ['spareWheel', 'Reservewiel'],
      ['jack', 'Krik'],
      ['wheelBrace', 'Wielsleutel'],
      ['matKit', 'Matten'],
      ['mainKeys', 'Hoofdsteunen'],
    ];
    interiorItems.forEach(([key, label]) => {
      const value = checklistData.interior?.[key];
      page.drawText(label, {
        x: margin + 16,
        y: colY + 1,
        size: 9,
        font: helveticaFont,
      });
      drawCheckbox(page, margin + 2, colY, '', value, helveticaFont);
      if (value && typeof value === 'string') {
        page.drawText(value, {
          x: margin + columnWidth - 50,
          y: colY + 1,
          size: 8,
          font: helveticaFont,
        });
      }
      colY -= 11;
    });
    drawBox(page, margin, checklistY - checklistHeight, columnWidth, checklistHeight);
    
    // EXTERIEUR COLUMN
    colY = checklistY;
    const col2X = margin + columnWidth + 5;
    drawFilledHeader(page, col2X, colY, columnWidth, 20, 'Exterieur', helveticaBold, 11);
    colY -= 25;
    const exteriorItems = [
      ['carExterior', 'Buitenzijde auto'],
      ['hubcaps', 'Wieldoppen'],
      ['licensePlates', 'Kentekemplaten'],
      ['mirrorCapsLeft', 'Spiegelkap links'],
      ['mirrorCapsRight', 'Spiegelkap rechts'],
      ['mirrorGlassLeftRight', 'Spiegelglas L+R'],
      ['antenna', 'Antenne'],
      ['wiperBlade', 'Ruitenwisser'],
      ['mudguards', 'Deurvanger'],
      ['slidingDoorBus', 'Schuifdeur (bus)'],
      ['indicatorSlots', 'Werkende sloten'],
      ['fogLights', 'Mistlampen voor'],
    ];
    exteriorItems.forEach(([key, label]) => {
      const value = checklistData.exterior?.[key];
      page.drawText(label, {
        x: col2X + 16,
        y: colY + 1,
        size: 9,
        font: helveticaFont,
      });
      drawCheckbox(page, col2X + 2, colY, '', value, helveticaFont);
      if (value && typeof value === 'string') {
        page.drawText(value, {
          x: col2X + columnWidth - 50,
          y: colY + 1,
          size: 8,
          font: helveticaFont,
        });
      }
      colY -= 11;
    });
    drawBox(page, col2X, checklistY - checklistHeight, columnWidth, checklistHeight);
    
    // AFLEVER CHECK COLUMN
    colY = checklistY;
    const col3X = margin + (columnWidth + 5) * 2;
    drawFilledHeader(page, col3X, colY, columnWidth, 20, 'Aflever Check', helveticaBold, 11);
    colY -= 25;
    const deliveryItems = [
      ['oilWater', 'Olie - water'],
      ['washerFluid', 'Ruitenproeiervloeistof'],
      ['lighting', 'Verlichting'],
      ['tireInflation', 'Bandenspanning incl. reservewiel'],
      ['fanBelt', 'Kachelfan'],
      ['engineBoard', 'Hoedenplank'],
      ['jackKnife', 'IJskrabber'],
      ['allDoorsOpen', 'Gaan alle deuren open'],
      ['licensePlatePapers', 'Kentekenpapieren'],
      ['validGreenCard', 'Geldige groene kaart'],
      ['europeanDamageForm', 'Europees schadeformulier'],
    ];
    deliveryItems.forEach(([key, label]) => {
      const value = checklistData.delivery?.[key];
      drawCheckbox(page, col3X + 2, colY, label, value, helveticaFont);
      colY -= 11;
    });
    drawBox(page, col3X, checklistY - checklistHeight, columnWidth, checklistHeight);
    
    // ===== RIGHT SIDEBAR =====
    colY = checklistY;
    
    // Gegevens voertuig (Vehicle Data)
    drawFilledHeader(page, sidebarX, colY, sidebarWidth, 16, 'Gegevens voertuig', helveticaBold, 9);
    colY -= 19;
    const vehicleDataHeight = 75;
    drawBox(page, sidebarX, colY - vehicleDataHeight, sidebarWidth, vehicleDataHeight);
    page.drawText(`Merk: ${vehicle?.brand || '-'}`, { x: sidebarX + 3, y: colY - 10, size: 8, font: helveticaFont });
    page.drawText(`Model: ${vehicle?.model || '-'}`, { x: sidebarX + 3, y: colY - 21, size: 8, font: helveticaFont });
    page.drawText(`Kenteken: ${vehicle?.licensePlate || '-'}`, { x: sidebarX + 3, y: colY - 32, size: 8, font: helveticaFont });
    page.drawText(`Brandstof: ${vehicle?.fuel || '-'}`, { x: sidebarX + 3, y: colY - 43, size: 8, font: helveticaFont });
    page.drawText(`Km: ${damageCheck.mileage || '-'}`, { x: sidebarX + 3, y: colY - 54, size: 8, font: helveticaFont });
    page.drawText(`Tank: ${damageCheck.fuelLevel || '-'}`, { x: sidebarX + 3, y: colY - 65, size: 8, font: helveticaFont });
    colY -= (vehicleDataHeight + 4);
    
    // Opmerkingen (Remarks)
    drawFilledHeader(page, sidebarX, colY, sidebarWidth, 16, 'Opmerkingen', helveticaBold, 9);
    colY -= 19;
    const remarksHeight = 60;
    drawBox(page, sidebarX, colY - remarksHeight, sidebarWidth, remarksHeight);
    if (damageCheck.notes) {
      page.drawText(damageCheck.notes.substring(0, 100), {
        x: sidebarX + 3,
        y: colY - 10,
        size: 7,
        font: helveticaFont,
        maxWidth: sidebarWidth - 6,
      });
    }
    colY -= (remarksHeight + 4);
    
    // Controle door (Checked by)
    drawFilledHeader(page, sidebarX, colY, sidebarWidth, 16, 'Controle door', helveticaBold, 9);
    colY -= 19;
    const controlHeight = 40;
    drawBox(page, sidebarX, colY - controlHeight, sidebarWidth, controlHeight);
    const controlDate = damageCheck.checkDate ? format(new Date(damageCheck.checkDate), 'dd-MM-yyyy') : '--';
    page.drawText(`Datum: ${controlDate}`, {
      x: sidebarX + 3,
      y: colY - 10,
      size: 8,
      font: helveticaFont,
    });
    page.drawText(`NAAM: ${damageCheck.completedBy || ''}`, {
      x: sidebarX + 3,
      y: colY - 25,
      size: 8,
      font: helveticaFont,
    });
    colY -= (controlHeight + 4);
    
    // Handtekening (Signatures)
    drawFilledHeader(page, sidebarX, colY, sidebarWidth, 16, 'Handtekening', helveticaBold, 9);
    colY -= 19;
    const sigHeight = 80;
    drawBox(page, sidebarX, colY - sigHeight, sidebarWidth, sigHeight);
    
    // Draw signatures if available
    if (damageCheck.renterSignature) {
      try {
        const base64Data = damageCheck.renterSignature.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        const signatureBytes = Buffer.from(base64Data, 'base64');
        const signatureImage = await pdfDoc.embedPng(signatureBytes);
        page.drawImage(signatureImage, {
          x: sidebarX + 5,
          y: colY - 45,
          width: sidebarWidth - 10,
          height: 35,
        });
      } catch (err) {
        console.error('Error embedding signature:', err);
      }
    }
    
    // ===== VEHICLE DIAGRAMS =====
    if (damageCheck.diagramWithAnnotations) {
      try {
        const base64Data = damageCheck.diagramWithAnnotations.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        const imageBytes = Buffer.from(base64Data, 'base64');
        const image = damageCheck.diagramWithAnnotations.startsWith('data:image/png') ?
          await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
        
        const diagramY = checklistY - checklistHeight - 20;
        const diagramWidth = width - margin * 2 - sidebarWidth - 10;
        const diagramHeight = 180;
        
        page.drawImage(image, {
          x: margin,
          y: diagramY - diagramHeight,
          width: diagramWidth,
          height: diagramHeight,
        });
      } catch (err) {
        console.error('Error embedding diagram:', err);
      }
    }
    
    // Save and return the PDF
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error generating interactive damage check PDF:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Vehicle transport reports — one big, clear page per transport for the driver.
// Same drag-position-fields-on-a-page model as the contract template above,
// but a much simpler implementation: flat field sources (no dotted paths, no
// preview-mode branching, no legacy double-JSON parsing) since this template
// system has no old data to stay compatible with. Background is an optional
// image (logo/letterhead) — PDF backgrounds aren't supported here, keeping
// per-page embedding simple for the multi-transport batch case below.
// ---------------------------------------------------------------------------

const TRANSPORT_TYPE_REPORT_LABELS: Record<string, string> = {
  swap: 'Vehicle Swap',
  tow: 'Tow',
  repossession: 'Terughaling',
  delivery: 'Aflevering',
  other: 'Overig',
};

const TRANSPORT_STATUS_REPORT_LABELS: Record<string, string> = {
  scheduled: 'Gepland',
  in_progress: 'Onderweg',
  completed: 'Voltooid',
  cancelled: 'Geannuleerd',
};

const DUTCH_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function formatDutchDate(date: Date, withTime = false): string {
  const day = date.getDate();
  const month = DUTCH_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const datePart = `${day} ${month} ${year}`;
  if (!withTime) return datePart;
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${datePart} ${hh}:${mm}`;
}

export function prepareTransportReportData(transport: VehicleTransport): Record<string, string> {
  const vehicle = transport.vehicle;
  const relatedVehicle = transport.relatedVehicle;
  const customer = transport.customer;

  const typeLabel = TRANSPORT_TYPE_REPORT_LABELS[transport.transportType] || transport.transportType;
  const statusLabel = TRANSPORT_STATUS_REPORT_LABELS[transport.status] || transport.status;
  // An external/outside vehicle has no fleet `vehicle` record — fall back to the
  // free-text external_* fields captured on the transport itself.
  const vehicleBrandValue = vehicle?.brand || (transport.isExternalVehicle ? (transport.externalBrand || '') : '');
  const vehicleModelValue = vehicle?.model || (transport.isExternalVehicle ? (transport.externalModel || '') : '');
  const vehicleFull = vehicle
    ? `${vehicle.brand} ${vehicle.model}`
    : (transport.isExternalVehicle ? [transport.externalBrand, transport.externalModel].filter(Boolean).join(' ') : '');
  const licensePlate = vehicle
    ? formatLicensePlate(vehicle.licensePlate)
    : (transport.isExternalVehicle && transport.externalLicensePlate ? formatLicensePlate(transport.externalLicensePlate) : '');
  const replacementVehicleFull = relatedVehicle ? `${relatedVehicle.brand} ${relatedVehicle.model}` : (transport.spareRequired ? 'TBD' : '');
  const replacementLicensePlate = relatedVehicle ? formatLicensePlate(relatedVehicle.licensePlate) : '';
  const scheduledDate = transport.scheduledDate ? formatDutchDate(new Date(transport.scheduledDate)) : '';
  const completedDate = transport.completedDate ? formatDutchDate(new Date(transport.completedDate)) : '';
  const originFull = [transport.originAddress, transport.originCity].filter(Boolean).join(', ');
  const destinationFull = [transport.destinationAddress, transport.destinationCity].filter(Boolean).join(', ');
  const distanceKm = transport.distanceKm != null ? `${Number(transport.distanceKm)} km` : '';
  const tollCost = transport.tollCost != null ? `€${Number(transport.tollCost).toFixed(2)}` : '';
  const billableAmount = transport.billableAmount != null ? `€${Number(transport.billableAmount).toFixed(2)}` : '';
  const generatedDate = formatDutchDate(new Date(), true);

  return {
    vehicleBrand: vehicleBrandValue,
    vehicleModel: vehicleModelValue,
    vehicleFull,
    licensePlate,
    externalOwnerName: transport.externalOwnerName || '',
    externalColor: transport.externalColor || '',
    replacementVehicleBrand: relatedVehicle?.brand || '',
    replacementVehicleModel: relatedVehicle?.model || '',
    replacementVehicleFull,
    replacementLicensePlate,
    transportType: typeLabel,
    status: statusLabel,
    scheduledDate,
    completedDate,
    originAddress: transport.originAddress || '',
    originCity: transport.originCity || '',
    originFull,
    destinationAddress: transport.destinationAddress || '',
    destinationCity: transport.destinationCity || '',
    destinationFull,
    distanceKm,
    tollCost,
    driverName: transport.driverName || '',
    reason: transport.reason || '',
    notes: transport.notes || '',
    customerName: customer?.name || '',
    billable: transport.billable ? 'Ja' : 'Nee',
    billableAmount,
    generatedDate,

    // Dutch "Label: Waarde" versions — handy when there is no pre-printed background image with labels
    lblVoertuig: `Voertuig: ${vehicleFull || '-'}`,
    lblKenteken: `Kenteken: ${licensePlate || '-'}`,
    lblVervangendVoertuig: `Vervangend voertuig: ${replacementVehicleFull || '-'}`,
    lblVervangendKenteken: `Kenteken vervangend voertuig: ${replacementLicensePlate || '-'}`,
    lblType: `Type transport: ${typeLabel}`,
    lblStatus: `Status: ${statusLabel}`,
    lblDatum: `Datum: ${scheduledDate || '-'}`,
    lblVoltooid: `Voltooid op: ${completedDate || '-'}`,
    lblVan: `Van: ${originFull || '-'}`,
    lblNaar: `Naar: ${destinationFull || '-'}`,
    lblAfstand: `Afstand: ${distanceKm || '-'}`,
    lblTolkosten: `Tolkosten: ${tollCost || '-'}`,
    lblChauffeur: `Chauffeur: ${transport.driverName || '-'}`,
    lblReden: `Reden: ${transport.reason || '-'}`,
    lblNotities: `Notities: ${transport.notes || '-'}`,
    lblKlant: `Klant: ${customer?.name || '-'}`,
    lblFactureerbaar: `Factureerbaar: ${transport.billable ? 'Ja' : 'Nee'}`,
    lblBedrag: `Bedrag: ${billableAmount || '-'}`,
    lblGegenereerd: `Gegenereerd op: ${generatedDate}`,
    lblEigenaar: `Eigenaar: ${transport.externalOwnerName || '-'}`,
  };
}

interface TransportReportField {
  x: number;
  y: number;
  fontSize?: number;
  isBold?: boolean;
  source?: string;
  label?: string;
  textAlign?: 'left' | 'center' | 'right';
}

async function drawTransportReportPage(
  pdfDoc: PDFDocument,
  page: any,
  transport: VehicleTransport,
  fields: TransportReportField[],
  helveticaFont: any,
  helveticaBold: any,
) {
  const data = prepareTransportReportData(transport);
  const textColor = rgb(0, 0, 0);

  for (const field of fields) {
    try {
      const value = field.source ? (data[field.source] ?? '') : '';
      const x = typeof field.x === 'number' && !isNaN(field.x) ? field.x : 0;
      const y = typeof field.y === 'number' && !isNaN(field.y) ? field.y : 0;
      const fontSize = typeof field.fontSize === 'number' && field.fontSize > 0 ? field.fontSize : 12;
      const font = field.isBold ? helveticaBold : helveticaFont;

      // Same coordinate math as the contract template renderer: top-left
      // origin with padding, flipped to PDF's bottom-left origin (A4 height
      // 842), so positions match exactly what the drag editor shows.
      const paddingX = 6;
      const paddingY = 1;
      const fontHeight = font.heightAtSize(fontSize);
      const ascent = fontHeight * 0.85;
      let adjustedX = x + paddingX;
      const adjustedY = 842 - y - paddingY - ascent;

      const textWidth = font.widthOfTextAtSize(value, fontSize);
      if (field.textAlign === 'center') {
        adjustedX = x - textWidth / 2;
      } else if (field.textAlign === 'right') {
        adjustedX = x - textWidth - paddingX;
      }

      page.drawText(value, { x: adjustedX, y: adjustedY, size: fontSize, font, color: textColor });
    } catch (error) {
      console.error(`Error drawing transport report field ${field.label || field.source}:`, error);
    }
  }
}

function parseTransportTemplateFields(template?: TransportReportTemplate | null): TransportReportField[] {
  if (!template?.fields) return [];
  if (Array.isArray(template.fields)) return template.fields as TransportReportField[];
  try {
    const parsed = typeof template.fields === 'string' ? JSON.parse(template.fields) : template.fields;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Generates one big, clear PDF page per transport — meant to be handed to a
 * driver with everything they need for the job. Supports multiple transports
 * in a single multi-page PDF (one page each), e.g. for a day's worth of jobs.
 */
export async function generateTransportReportsPdf(
  transports: VehicleTransport[],
  template?: TransportReportTemplate | null,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fields = parseTransportTemplateFields(template);

  // Embed the background image once (if any) and reuse it across every page —
  // pdf-lib lets one embedded image be drawn on multiple pages cheaply.
  let backgroundImage: any = null;
  if (template?.backgroundPath) {
    try {
      const backgroundFullPath = path.join(process.cwd(), template.backgroundPath);
      if (fs.existsSync(backgroundFullPath)) {
        const bytes = fs.readFileSync(backgroundFullPath);
        const ext = path.extname(backgroundFullPath).toLowerCase();
        if (ext === '.png') {
          backgroundImage = await pdfDoc.embedPng(bytes);
        } else if (ext === '.jpg' || ext === '.jpeg') {
          backgroundImage = await pdfDoc.embedJpg(bytes);
        }
      }
    } catch (error) {
      console.error('Error loading transport report template background:', error);
    }
  }

  for (const transport of transports) {
    const page = pdfDoc.addPage([595, 842]); // A4
    if (backgroundImage) {
      const { width, height } = page.getSize();
      page.drawImage(backgroundImage, { x: 0, y: 0, width, height });
    }
    await drawTransportReportPage(pdfDoc, page, transport, fields, helveticaFont, helveticaBold);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}