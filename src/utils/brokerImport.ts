/**
 * STOCKINSIGHT Multi-Broker Holdings Importer
 * Parses CSV, Excel (.xlsx, .xls), TSV, and JSON exports from Indian stock brokers:
 * - Zerodha Kite (Holdings CSV / Excel)
 * - Groww (Stocks Holdings Export)
 * - Upstox (Holdings Report)
 * - Angel One / ICICI Direct / Kotak Securities / HDFC Sky
 * - Generic Custom CSV / Excel / JSON
 */

import * as XLSX from 'xlsx';
import { Holding } from '../types/portfolio';
import { SearchService } from '../api/searchService';

export interface ImportPreviewResult {
  brokerDetected: string;
  totalRowsFound: number;
  validHoldings: Holding[];
  invalidRowsCount: number;
  errors: string[];
}

export class BrokerImportParser {
  /**
   * Cleans stock symbol by removing exchange prefixes and series suffixes
   * e.g. "NSE:RELIANCE-EQ" -> "RELIANCE", "TCS.NS" -> "TCS", "NSE_EQ|INFY" -> "INFY"
   */
  public static cleanSymbol(rawSymbol: string): string {
    if (!rawSymbol) return '';
    let sym = rawSymbol.toString().trim().toUpperCase();

    // Strip exchange prefixes
    sym = sym.replace(/^(NSE|BSE|NSE_EQ|BSE_EQ)[:|]/i, '');
    // Strip common suffixes
    sym = sym.replace(/(\.NS|\.BO|-EQ|-BE|-BL|-SM)$/i, '');
    // Strip any trailing non-alphanumeric except &
    sym = sym.replace(/[^A-Z0-9&]/g, '');

    return sym.trim();
  }

  /**
   * Intelligently parses file buffer into structured Holdings
   */
  public static async parseFile(file: File): Promise<ImportPreviewResult> {
    const fileName = file.name.toLowerCase();
    const errors: string[] = [];

    let rawData: Record<string, unknown>[] = [];

    if (fileName.endsWith('.json')) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        rawData = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e: unknown) {
        const err = e as Error;
        return {
          brokerDetected: 'Unknown / JSON Error',
          totalRowsFound: 0,
          validHoldings: [],
          invalidRowsCount: 0,
          errors: [`Failed to parse JSON file: ${err.message}`],
        };
      }
    } else {
      // Excel or CSV / TSV via XLSX reader
      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      } catch (e: unknown) {
        const err = e as Error;
        return {
          brokerDetected: 'Parse Error',
          totalRowsFound: 0,
          validHoldings: [],
          invalidRowsCount: 0,
          errors: [`Failed to read tabular file: ${err.message}`],
        };
      }
    }

    if (!rawData || rawData.length === 0) {
      return {
        brokerDetected: 'Empty Document',
        totalRowsFound: 0,
        validHoldings: [],
        invalidRowsCount: 0,
        errors: ['The uploaded file contains no data rows.'],
      };
    }

    // Inspect headers of first non-empty row to detect broker format
    const sampleRow = rawData[0];
    const normalizedKeys = Object.keys(sampleRow).map((k) => k.toLowerCase().trim());

    let brokerDetected = 'Generic CSV / Excel';
    if (normalizedKeys.some((k) => k.includes('tradingsymbol') || k.includes('instrument'))) {
      if (normalizedKeys.some((k) => k.includes('cur. val') || k.includes('avg. cost'))) {
        brokerDetected = 'Zerodha Kite';
      } else if (normalizedKeys.some((k) => k.includes('cnc_used_quantity') || k.includes('collateral_type'))) {
        brokerDetected = 'Upstox';
      }
    } else if (normalizedKeys.some((k) => k.includes('shares') && k.includes('invested'))) {
      brokerDetected = 'Groww';
    } else if (normalizedKeys.some((k) => k.includes('scrip') || k.includes('security name'))) {
      brokerDetected = 'Angel One / Institutional Broker';
    }

    // Process rows
    const validHoldings: Holding[] = [];
    let invalidRowsCount = 0;

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];

      // Find symbol
      let rawSymbol = '';
      let quantity = 0;
      let averageBuyPrice = 0;
      let companyName = '';
      let sector = '';
      let isin = '';

      for (const [key, val] of Object.entries(row)) {
        const k = key.toLowerCase().trim();
        const strVal = (val ?? '').toString().trim();

        // Symbol mapping
        if (
          !rawSymbol &&
          (k === 'symbol' ||
            k === 'tradingsymbol' ||
            k === 'instrument' ||
            k === 'stock' ||
            k === 'scrip' ||
            k === 'ticker' ||
            k === 'stock symbol')
        ) {
          rawSymbol = strVal;
        }

        // Company mapping
        if (
          !companyName &&
          (k === 'company' ||
            k === 'company name' ||
            k === 'stock name' ||
            k === 'security' ||
            k === 'security name')
        ) {
          companyName = strVal;
        }

        // Quantity mapping
        if (
          quantity === 0 &&
          (k === 'qty' ||
            k === 'qty.' ||
            k === 'quantity' ||
            k === 'shares' ||
            k === 'units' ||
            k === 'quantity available' ||
            k === 'total qty')
        ) {
          const num = parseFloat(strVal.replace(/,/g, ''));
          if (!isNaN(num) && num > 0) quantity = Math.floor(num);
        }

        // Average Buy Price mapping
        if (
          averageBuyPrice === 0 &&
          (k === 'avg. cost' ||
            k === 'avg cost' ||
            k === 'avg price' ||
            k === 'average price' ||
            k === 'buy price' ||
            k === 'average buy price' ||
            k === 'buy avg' ||
            k === 'purchase price' ||
            k === 'cost price')
        ) {
          const num = parseFloat(strVal.replace(/[₹,]/g, ''));
          if (!isNaN(num) && num > 0) averageBuyPrice = num;
        }

        // ISIN mapping
        if (!isin && (k === 'isin' || k === 'isin code')) {
          isin = strVal;
        }

        // Sector mapping
        if (!sector && (k === 'sector' || k === 'industry')) {
          sector = strVal;
        }
      }

      // If symbol is missing but companyName has something, check if companyName is symbol
      if (!rawSymbol && companyName && companyName.length <= 15 && !companyName.includes(' ')) {
        rawSymbol = companyName;
      }

      const symbol = this.cleanSymbol(rawSymbol);

      if (!symbol || quantity <= 0 || averageBuyPrice <= 0) {
        invalidRowsCount++;
        continue;
      }

      // Enrich company and sector if not provided
      const known = SearchService.getInstrumentBySymbol(symbol);
      if (known) {
        if (!companyName) companyName = known.name;
        if (!sector) sector = known.sector;
        if (!isin) isin = known.isin;
      }

      validHoldings.push({
        id: `imp_${symbol}_${Date.now()}_${i}`,
        symbol,
        companyName: companyName || symbol,
        sector: sector || 'Equities',
        isin: isin || undefined,
        quantity,
        averageBuyPrice,
        addedAt: new Date().toISOString(),
      });
    }

    if (validHoldings.length === 0) {
      errors.push(
        'Could not find valid Symbol, Quantity, and Average Buy Price columns. Please check headers.'
      );
    }

    return {
      brokerDetected,
      totalRowsFound: rawData.length,
      validHoldings,
      invalidRowsCount,
      errors,
    };
  }

  /**
   * Generates sample CSV file content for download
   */
  public static generateSampleCSV(): string {
    return `Symbol,Quantity,Average Price,Company Name,Sector\nRELIANCE,50,2820.50,Reliance Industries Limited,Oil & Gas / Refining\nTCS,30,3950.00,Tata Consultancy Services,Information Technology\nHDFCBANK,100,1680.00,HDFC Bank Limited,Banking - Private\nBAJFINANCE,20,7150.00,Bajaj Finance Limited,Financial Services - NBFC\nINFY,75,1890.00,Infosys Limited,Information Technology`;
  }
}
