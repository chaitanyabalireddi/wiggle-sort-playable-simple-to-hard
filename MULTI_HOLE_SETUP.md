# Multi-Hole Setup Guide

This guide explains how to add 2 sets of holes (2 main holes + 2 preview holes) to a level.

## Code Changes Applied

The following changes have been made to support multiple holes per level:

### 1. Hole.ts
- Added `holeSetId` property to pair main holes with their preview holes
- **Fixed**: Main holes now enforce different colors - they check other main holes and never pick the same color
- **Fixed**: Preview holes correctly show their paired main hole's next color
- **Fixed**: `advanceColor()` now enforces that main holes never have matching colors
- **Fixed**: `start()` initialization avoids color conflicts between main holes

### 2. GameManager.ts
- Updated tutorial logic to work with multiple holes
- Tutorial now checks all holes for matching snake colors

### 3. Snake.ts
- Updated hole seeking to skip preview holes (only enter main holes)
- Snakes automatically find the closest matching main hole by color

## How to Set Up 2 Sets of Holes in Editor

For a level with 2 hole sets, follow these steps:

### Step 1: Create Main Holes
1. Drag the Hole prefab into your level twice
2. Position them at different locations (e.g., left side and right side)
3. Name them: `Hole-Set0-Main` and `Hole-Set1-Main`
4. On each Hole component:
   - Set `holeSetId`: `0` for first hole, `1` for second hole
   - Keep `isNextPreview` **unchecked**
   - Set up color mappings as needed

### Step 2: Create Preview Holes
1. Drag the Hole prefab into your level twice more
2. Position them near their respective main holes (e.g., above or beside)
3. Name them: `Hole-Set0-Preview` and `Hole-Set1-Preview`
4. On each Hole component:
   - Set `holeSetId` to match the main hole: `0` or `1`
   - Check `isNextPreview` **checked**
   - Set up color mappings same as main hole

### Example Layout

```
Level-2 (or whichever level)
├── Hole-Set0-Main (holeSetId=0, isNextPreview=false)
│   └── Position: (-5, 0, 0) - Left side
├── Hole-Set0-Preview (holeSetId=0, isNextPreview=true)
│   └── Position: (-5, 1, 2) - Above left main hole
├── Hole-Set1-Main (holeSetId=1, isNextPreview=false)
│   └── Position: (5, 0, 0) - Right side
└── Hole-Set1-Preview (holeSetId=1, isNextPreview=true)
    └── Position: (5, 1, 2) - Above right main hole
```

## How It Works

1. **Color Assignment**: Each main hole independently picks colors from snakes in the scene
2. **Preview Display**: Each preview hole shows the "next" color for its paired main hole
3. **Snake Targeting**: Snakes seek the closest main hole that matches their color
4. **Tutorial**: Tutorial hand guides players to snakes matching any hole's current color

## Important Notes

- Each main hole operates independently with its own color cycle
- Holes avoid picking the same color if multiple snakes of that color exist
- Preview holes automatically sync to show their main hole's next color
- No changes needed to GameManager levelNodes - just add holes to the level prefab/scene
