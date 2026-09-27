import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrandPalette, PALETTES, getSavedPaletteId, savePaletteId, applyPalette } from './brandKit';

interface ThemeContextValue {
  paletteId: string;
  palette: BrandPalette;
  setPaletteId: (id: string) => void;
  availablePalettes: BrandPalette[];
}

const ThemeContext = createContext<ThemeContextValue>({
  paletteId: 'obsidianPlum',
  palette: PALETTES.obsidianPlum,
  setPaletteId: () => {},
  availablePalettes: Object.values(PALETTES),
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [paletteId, setPaletteIdState] = useState<string>(() => getSavedPaletteId());

  useEffect(() => {
    applyPalette(paletteId);
  }, [paletteId]);

  const setPaletteId = (id: string) => {
    if (PALETTES[id]) {
      setPaletteIdState(id);
      savePaletteId(id);
    }
  };

  const palette = PALETTES[paletteId] || PALETTES.obsidianPlum;

  return (
    <ThemeContext.Provider
      value={{
        paletteId,
        palette,
        setPaletteId,
        availablePalettes: Object.values(PALETTES),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
