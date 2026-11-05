/**
 * Sector Normalizer & Classifier
 * Maps raw Upstox profile sector strings to standardized model routes
 */

import { SectorClassification } from '../types/engine';

export class Normalizer {
  private static readonly SPECIFIC_NBFC_KEYWORDS = [
    'non banking',
    'non-banking',
    'nbfc',
    'housing finance',
  ];

  private static readonly BANKING_KEYWORDS = [
    'bank',
    'commercial bank',
    'private sector bank',
    'public sector bank',
  ];

  private static readonly GENERAL_NBFC_KEYWORDS = [
    'financial services',
    'asset management',
    'microfinance',
  ];

  private static readonly ETF_KEYWORDS = [
    'etf',
    'exchange traded fund',
    'commodity etf',
    'gold etf',
    'silver etf',
    'index fund',
    'index etf',
    'nifty bees',
    'gold bees',
  ];

  /**
   * Routes sector name to quantitative model category
   */
  public static routeSector(
    sectorName: string,
    industryName?: string,
    symbol?: string
  ): SectorClassification {
    const combined = `${sectorName || ''} ${industryName || ''}`.toLowerCase();
    const symUpper = (symbol || '').toUpperCase();

    // Check ETF first
    if (
      this.ETF_KEYWORDS.some((kw) => combined.includes(kw)) ||
      symUpper.endsWith('BEES') ||
      symUpper.includes('ETF')
    ) {
      return 'ETF';
    }

    // Check Specific NBFC first to prevent "non banking" from matching generic "bank"
    if (this.SPECIFIC_NBFC_KEYWORDS.some((kw) => combined.includes(kw))) {
      return 'NBFC_HFC';
    }

    // Check Commercial Bank
    for (const kw of this.BANKING_KEYWORDS) {
      if (combined.includes(kw)) {
        return 'COMMERCIAL_BANK';
      }
    }

    // Check General NBFC / Financial Services
    for (const kw of this.GENERAL_NBFC_KEYWORDS) {
      if (combined.includes(kw)) {
        return 'NBFC_HFC';
      }
    }

    // Default to Industrial / Non-Financial
    return 'INDUSTRIAL';
  }

  /**
   * Resolves broad instrument type: EQUITY, ETF, BANK, NBFC, or OTHER
   */
  public static getInstrumentType(
    sectorName: string,
    industryName?: string,
    symbol?: string
  ): 'EQUITY' | 'ETF' | 'BANK' | 'NBFC' | 'OTHER' {
    const sector = this.routeSector(sectorName, industryName, symbol);
    if (sector === 'ETF') return 'ETF';
    if (sector === 'COMMERCIAL_BANK') return 'BANK';
    if (sector === 'NBFC_HFC') return 'NBFC';
    if (sector === 'INDUSTRIAL') return 'EQUITY';
    return 'OTHER';
  }

  /**
   * Identifies if a sector is highly cyclical (Metals, Commodities, Sugar, Shipping)
   */
  public static isCyclicalSector(sectorName: string, industryName?: string): boolean {
    const combined = `${sectorName || ''} ${industryName || ''}`.toLowerCase();
    const cyclicalKeywords = [
      'metal',
      'steel',
      'aluminum',
      'copper',
      'mining',
      'commodity',
      'sugar',
      'shipping',
      'petrochemical',
      'fertilizer',
      'cement',
    ];

    return cyclicalKeywords.some((kw) => combined.includes(kw));
  }
}
