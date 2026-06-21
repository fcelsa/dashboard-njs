import { roundToDecimals, normalizeDecimal, isNumericString } from './utils/number-utils.js';

function initCalcSheet() {
  const COLS = 11;
  const ROWS = 32;
  const DB_NAME = "calc-sheet-db";
  const STORE_NAME = "sheet";
  const SHEET_KEY = "default";
  const columnLabels = Array.from({ length: COLS }, (_, i) => String.fromCharCode(65 + i));
  const cellData = new Map();
  const cellElements = new Map();

  const sheetRoot = document.querySelector("[data-calc-sheet]");
  const toolbar = document.querySelector("[data-calc-sheet-toolbar]");
  const formulaBar = document.querySelector("[data-sheet-formula]");
  const saveIndicator = document.querySelector("[data-sheet-save]");
  if (!sheetRoot) return;

  sheetRoot.innerHTML = "";

  let activeCellId = null;
  let saveTimer = null;
  let hasPendingSave = false;
  let copyBuffer = null;
  let selectionAnchor = null;
  let selectionEnd = null;
  let isSelecting = false;
  const EMPTY_CELL_ENTRY = Object.freeze({ raw: "", bold: false, color: "black" });
  const DRAG_HOLD_DELAY = 320;
  const DRAG_MOVE_TOLERANCE = 6;

  let dragHoldTimer = null;
  let dragPointerState = null;
  let dragState = null;

  const contextMenu = document.createElement("div");
  contextMenu.className = "sheet-context-menu";
  contextMenu.innerHTML = `
    <button type="button" data-menu-action="copy">Copia</button>
    <button type="button" data-menu-action="paste">Incolla</button>
    <button type="button" data-menu-action="cut">Taglia</button>
  `;
  document.body.appendChild(contextMenu);

  const corner = document.createElement("div");
  corner.className = "calc-sheet-cell header corner";
  sheetRoot.appendChild(corner);

  columnLabels.forEach((label) => {
    const cell = document.createElement("div");
    cell.className = "calc-sheet-cell header";
    cell.textContent = label;
    sheetRoot.appendChild(cell);
  });

  for (let row = 1; row <= ROWS; row += 1) {
    const rowHeader = document.createElement("div");
    rowHeader.className = "calc-sheet-cell header";
    rowHeader.textContent = row;
    sheetRoot.appendChild(rowHeader);

    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElement("div");
      cell.className = "calc-sheet-cell";
      cell.dataset.cell = `${columnLabels[col]}${row}`;
      cell.dataset.editable = "true";
      cell.contentEditable = "true";
      cell.spellcheck = false;
      cell.setAttribute("role", "textbox");
      cell.setAttribute("aria-label", `Cella ${cell.dataset.cell}`);
      cell.classList.add("is-view");
      attachCellHandlers(cell);
      cellElements.set(cell.dataset.cell, cell);
      sheetRoot.appendChild(cell);
    }
  }

  loadSheetState().then(() => {
    refreshAllCells();
  });

  if (toolbar) {
    toolbar.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    toolbar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sheet-action]");
      if (!button || !activeCellId) return;
      const action = button.dataset.sheetAction;
      const entry = getCellEntry(activeCellId);

      if (action === "bold") {
        entry.bold = !entry.bold;
      }

      if (action === "color") {
        const color = button.dataset.color || "black";
        entry.color = color;
      }

      setCellEntry(activeCellId, entry);
      refreshAllCells();
      const activeCell = cellElements.get(activeCellId);
      if (activeCell) applyCellStyle(activeCell, entry);
      updateToolbarState();
    });
  }

  document.addEventListener("mouseup", (event) => {
    isSelecting = false;
    finishCellDrag(event);
    clearDragHold();
  });

  document.addEventListener("mousemove", (event) => {
    if (dragState) {
      updateDragTargetFromPoint(event.clientX, event.clientY, event.shiftKey);
      return;
    }

    if (!dragPointerState) return;
    const movedX = Math.abs(event.clientX - dragPointerState.startX);
    const movedY = Math.abs(event.clientY - dragPointerState.startY);
    if (movedX > DRAG_MOVE_TOLERANCE || movedY > DRAG_MOVE_TOLERANCE) {
      clearDragHold();
    }
  });

  window.addEventListener("blur", () => {
    isSelecting = false;
    clearDragHold();
    clearCellDragState();
  });

  document.addEventListener("mousedown", (event) => {
    if (!contextMenu.contains(event.target)) {
      hideContextMenu();
    }
  });

  contextMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-menu-action]");
    if (!button) return;
    const action = button.dataset.menuAction;
    if (action === "copy") {
      copySelectionRange();
    } else if (action === "cut") {
      cutSelectionRange();
    } else if (action === "paste") {
      pasteSelectionRange();
    }
    hideContextMenu();
  });

  function attachCellHandlers(cell) {
    cell.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (!cell.classList.contains("is-view")) return;
      const cellId = cell.dataset.cell;
      armCellDrag(cellId, event);
      isSelecting = true;
      if (event.shiftKey && selectionAnchor) {
        selectionEnd = cellId;
      } else {
        selectionAnchor = cellId;
        selectionEnd = cellId;
      }
      applySelection();
    });

    cell.addEventListener("mouseover", () => {
      if (dragState) return;
      if (!isSelecting) return;
      const cellId = cell.dataset.cell;
      selectionEnd = cellId;
      applySelection();
    });

    cell.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      clearDragHold();
      const cellId = cell.dataset.cell;
      if (!isCellInSelection(cellId)) {
        selectionAnchor = cellId;
        selectionEnd = cellId;
        applySelection();
      }
      activeCellId = cellId;
      setActiveCell(cell);
      updateToolbarState();
      updateFormulaBar(cellId);
      showContextMenu(event.clientX, event.clientY);
    });

    cell.addEventListener("focus", () => {
      activeCellId = cell.dataset.cell;
      setActiveCell(cell);
      selectionAnchor = activeCellId;
      selectionEnd = activeCellId;
      applySelection();
      cell.classList.add("is-view");
      cell.textContent = formatDisplayValue(getRawValue(activeCellId));
      applyCellStyle(cell, getCellEntry(activeCellId));
      cell.classList.toggle("is-draggable", isCellDraggable(activeCellId));
      updateToolbarState();
      updateFormulaBar(activeCellId);
    });

    cell.addEventListener("blur", () => {
      const raw = cell.textContent ?? "";
      if (!cell.classList.contains("is-view")) {
        setRawValue(cell.dataset.cell, raw.trim());
      }
      activeCellId = null;
      clearActiveCell();
      cell.classList.remove("is-view");
      cell.classList.remove("is-draggable", "is-drag-pending");
      refreshAllCells();
    });

    cell.addEventListener("keydown", (event) => {
      handleKeydown(event, cell);
    });
  }

  function handleKeydown(event, cell) {
    const isViewMode = cell.classList.contains("is-view");
    const key = event.key;

    if (isViewMode) {
      if (key === "Enter") {
        event.preventDefault();
        enterEditMode(cell);
        return;
      }

      if (key === "Backspace") {
        event.preventDefault();
        const raw = getRawValue(cell.dataset.cell);
        enterEditMode(cell);
        if (raw.length > 0) {
          cell.textContent = raw.slice(0, -1);
        }
        placeCaretAtEnd(cell);
        return;
      }

      if (key === "Delete") {
        event.preventDefault();
        setRawValue(cell.dataset.cell, "");
        refreshAllCells();
        return;
      }

      if (key === "Tab") {
        event.preventDefault();
        moveSelection(cell, event.shiftKey ? "left" : "right");
        return;
      }

      if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
        event.preventDefault();
        moveSelection(cell, arrowToDirection(key));
        return;
      }

      if (isPrintableKey(event)) {
        event.preventDefault();
        enterEditMode(cell, key);
      }

      return;
    }

    if (key === "Enter") {
      event.preventDefault();
      commitEdit(cell);
      moveSelection(cell, "down");
      return;
    }

    if (key === "Tab") {
      event.preventDefault();
      commitEdit(cell);
      moveSelection(cell, event.shiftKey ? "left" : "right");
      return;
    }

    if (key === "Escape") {
      event.preventDefault();
      cell.textContent = formatDisplayValue(getRawValue(cell.dataset.cell));
      cell.classList.add("is-view");
      return;
    }

    if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
      if (event.ctrlKey || event.metaKey) {
        return;
      }
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        return;
      }
    }
  }

  function enterEditMode(cell, initialChar) {
    clearDragHold();
    cell.classList.remove("is-view");
    cell.classList.remove("is-draggable");
    cell.textContent = getRawValue(cell.dataset.cell);
    if (typeof initialChar === "string") {
      cell.textContent = initialChar;
    }
    placeCaretAtEnd(cell);
  }

  function commitEdit(cell) {
    const raw = cell.textContent ?? "";
    setRawValue(cell.dataset.cell, raw.trim());
    cell.classList.add("is-view");
    refreshAllCells();
  }

  function arrowToDirection(key) {
    switch (key) {
      case "ArrowUp":
        return "up";
      case "ArrowDown":
        return "down";
      case "ArrowLeft":
        return "left";
      default:
        return "right";
    }
  }

  function moveSelection(cell, direction) {
    const cellId = cell.dataset.cell;
    const position = parseCellId(cellId);
    if (!position) return;
    let { row, col } = position;

    if (direction === "up") row -= 1;
    if (direction === "down") row += 1;
    if (direction === "left") col -= 1;
    if (direction === "right") col += 1;

    row = Math.min(Math.max(row, 1), ROWS);
    col = Math.min(Math.max(col, 0), COLS - 1);

    const nextId = `${columnLabels[col]}${row}`;
    const nextCell = cellElements.get(nextId);
    if (nextCell) {
      nextCell.focus();
    }
  }

  function armCellDrag(cellId, event) {
    clearDragHold();
    if (!isCellDraggable(cellId)) return;

    const sourceCell = cellElements.get(cellId);
    dragPointerState = {
      cellId,
      startX: event.clientX,
      startY: event.clientY,
    };
    sourceCell?.classList.add("is-drag-pending");

    dragHoldTimer = setTimeout(() => {
      beginCellDrag(cellId);
    }, DRAG_HOLD_DELAY);
  }

  function clearDragHold() {
    if (dragHoldTimer) {
      clearTimeout(dragHoldTimer);
      dragHoldTimer = null;
    }

    if (dragPointerState) {
      const pendingCell = cellElements.get(dragPointerState.cellId);
      pendingCell?.classList.remove("is-drag-pending");
    }

    dragPointerState = null;
  }

  function beginCellDrag(sourceCellId) {
    const sourceCell = cellElements.get(sourceCellId);
    if (!sourceCell || !isCellDraggable(sourceCellId)) {
      clearDragHold();
      return;
    }

    clearDragHold();
    hideContextMenu();
    isSelecting = false;
    dragState = {
      sourceCellId,
      targetCellId: sourceCellId,
      copyMode: false,
    };

    sheetRoot.classList.add("is-cell-dragging");
    sourceCell.classList.add("is-drag-source");
  }

  function updateDragTargetFromPoint(clientX, clientY, copyMode) {
    if (!dragState) return;
    setDragCopyMode(copyMode);

    const targetCell = getEditableCellFromPoint(clientX, clientY);
    setDragTargetCell(targetCell?.dataset.cell ?? null);
  }

  function setDragCopyMode(copyMode) {
    if (!dragState) return;

    dragState.copyMode = copyMode;
    sheetRoot.classList.toggle("is-copy-drag", copyMode);

    const targetCell =
      dragState.targetCellId && dragState.targetCellId !== dragState.sourceCellId
        ? cellElements.get(dragState.targetCellId)
        : null;
    targetCell?.classList.toggle("is-copy-target", copyMode);
  }

  function setDragTargetCell(cellId) {
    if (!dragState) return;

    const previousTarget =
      dragState.targetCellId && dragState.targetCellId !== dragState.sourceCellId
        ? cellElements.get(dragState.targetCellId)
        : null;
    previousTarget?.classList.remove("is-drop-target", "is-copy-target");

    dragState.targetCellId = cellId;

    if (!cellId || cellId === dragState.sourceCellId) return;

    const nextTarget = cellElements.get(cellId);
    if (!nextTarget) return;
    nextTarget.classList.add("is-drop-target");
    nextTarget.classList.toggle("is-copy-target", dragState.copyMode);
  }

  function finishCellDrag(event) {
    if (!dragState) return;

    updateDragTargetFromPoint(event.clientX, event.clientY, event.shiftKey);

    const { sourceCellId, targetCellId } = dragState;
    const shouldCopy = Boolean(event.shiftKey);

    if (targetCellId && targetCellId !== sourceCellId) {
      moveOrCopyCell(sourceCellId, targetCellId, shouldCopy);
    }

    clearCellDragState();
  }

  function clearCellDragState() {
    if (!dragState) return;

    const sourceCell = cellElements.get(dragState.sourceCellId);
    const targetCell =
      dragState.targetCellId && dragState.targetCellId !== dragState.sourceCellId
        ? cellElements.get(dragState.targetCellId)
        : null;

    sourceCell?.classList.remove("is-drag-source");
    targetCell?.classList.remove("is-drop-target", "is-copy-target");
    sheetRoot.classList.remove("is-cell-dragging", "is-copy-drag");
    dragState = null;
  }

  function getEditableCellFromPoint(clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY);
    const cell = target?.closest?.(".calc-sheet-cell[data-editable='true']");
    if (!cell || !sheetRoot.contains(cell)) return null;
    return cell;
  }

  function moveOrCopyCell(sourceCellId, targetCellId, shouldCopy) {
    if (sourceCellId === targetCellId) return;
    if (!isCellDraggable(sourceCellId)) return;

    const sourcePosition = parseCellId(sourceCellId);
    const targetPosition = parseCellId(targetCellId);
    if (!sourcePosition || !targetPosition) return;

    const sourceEntry = cloneCellEntry(getCellEntry(sourceCellId));
    const deltaRow = targetPosition.row - sourcePosition.row;
    const deltaCol = targetPosition.col - sourcePosition.col;
    const targetEntry = translateCellEntry(sourceEntry, deltaRow, deltaCol);

    setCellEntry(targetCellId, targetEntry);
    if (!shouldCopy) {
      setCellEntry(sourceCellId, createEmptyCellEntry());
    }

    activeCellId = targetCellId;
    selectionAnchor = targetCellId;
    selectionEnd = targetCellId;
    refreshAllCells();

    const targetCell = cellElements.get(targetCellId);
    if (targetCell) {
      setActiveCell(targetCell);
      targetCell.focus();
    }

    applySelection();
    updateToolbarState();
    updateFormulaBar(targetCellId);
  }

  function getSelectionRange() {
    const anchorId = selectionAnchor || activeCellId;
    const endId = selectionEnd || selectionAnchor || activeCellId;
    if (!anchorId || !endId) return null;
    const anchor = parseCellId(anchorId);
    const end = parseCellId(endId);
    if (!anchor || !end) return null;

    const startRow = Math.min(anchor.row, end.row);
    const endRow = Math.max(anchor.row, end.row);
    const startCol = Math.min(anchor.col, end.col);
    const endCol = Math.max(anchor.col, end.col);
    return {
      startRow,
      endRow,
      startCol,
      endCol,
      rows: endRow - startRow + 1,
      cols: endCol - startCol + 1,
    };
  }

  function applySelection() {
    const range = getSelectionRange();
    if (!range) return;
    cellElements.forEach((cell, cellId) => {
      const position = parseCellId(cellId);
      if (!position) return;
      const isSelected =
        position.row >= range.startRow &&
        position.row <= range.endRow &&
        position.col >= range.startCol &&
        position.col <= range.endCol;
      cell.classList.toggle("is-selected", isSelected);
    });
  }

  function isCellInSelection(cellId) {
    const range = getSelectionRange();
    if (!range) return false;
    const position = parseCellId(cellId);
    if (!position) return false;
    return (
      position.row >= range.startRow &&
      position.row <= range.endRow &&
      position.col >= range.startCol &&
      position.col <= range.endCol
    );
  }

  function showContextMenu(x, y) {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add("is-visible");
  }

  function hideContextMenu() {
    contextMenu.classList.remove("is-visible");
  }

  function copySelectionRange() {
    const range = getSelectionRange();
    if (!range) return;
    const { startRow, startCol, rows, cols } = range;
    const values = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cellId = `${columnLabels[startCol + c]}${startRow + r}`;
        values[r][c] = getRawValue(cellId);
      }
    }

    copyBuffer = {
      rows,
      cols,
      origin: { row: startRow, col: startCol },
      values,
    };
  }

  function cutSelectionRange() {
    const range = getSelectionRange();
    if (!range) return;
    copySelectionRange();
    const { startRow, startCol, rows, cols } = range;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cellId = `${columnLabels[startCol + c]}${startRow + r}`;
        setRawValue(cellId, "");
      }
    }
    refreshAllCells();
    if (activeCellId) updateFormulaBar(activeCellId);
  }

  function pasteSelectionRange() {
    if (!copyBuffer) return;
    const range = getSelectionRange();
    if (!range) return;

    const { startRow, startCol, rows, cols } = range;
    const { origin, values, rows: srcRows, cols: srcCols } = copyBuffer;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const targetRow = startRow + r;
        const targetCol = startCol + c;
        if (targetRow < 1 || targetRow > ROWS) continue;
        if (targetCol < 0 || targetCol >= COLS) continue;

        const sourceRowOffset = r % srcRows;
        const sourceColOffset = c % srcCols;
        const sourceRaw = values[sourceRowOffset]?.[sourceColOffset] ?? "";

        const sourceCellRow = origin.row + sourceRowOffset;
        const sourceCellCol = origin.col + sourceColOffset;
        const deltaRow = targetRow - sourceCellRow;
        const deltaCol = targetCol - sourceCellCol;

        const nextValue = translateFormula(sourceRaw, deltaRow, deltaCol);
        const targetId = `${columnLabels[targetCol]}${targetRow}`;
        setRawValue(targetId, nextValue);
      }
    }

    refreshAllCells();
    if (activeCellId) updateFormulaBar(activeCellId);
  }

  function setActiveCell(cell) {
    cellElements.forEach((item) => item.classList.remove("is-active"));
    cell.classList.add("is-active");
  }

  function clearActiveCell() {
    cellElements.forEach((item) => item.classList.remove("is-active"));
  }

  function parseCellId(cellId) {
    const match = /^([A-K])(\d{1,2})$/.exec(cellId);
    if (!match) return null;
    const col = columnLabels.indexOf(match[1]);
    const row = Number.parseInt(match[2], 10);
    if (Number.isNaN(row) || col < 0) return null;
    return { row, col };
  }

  function isPrintableKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    return event.key.length === 1;
  }

  function placeCaretAtEnd(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function getRawValue(cellId) {
    return getCellEntry(cellId).raw ?? "";
  }

  function setRawValue(cellId, value) {
    const entry = getCellEntry(cellId);
    entry.raw = value;
    setCellEntry(cellId, entry);
  }

  function isCellDraggable(cellId) {
    return getRawValue(cellId).trim().length > 0;
  }

  function createEmptyCellEntry() {
    return { ...EMPTY_CELL_ENTRY };
  }

  function cloneCellEntry(entry) {
    return {
      raw: entry?.raw ?? "",
      bold: Boolean(entry?.bold),
      color: entry?.color || "black",
    };
  }

  function translateCellEntry(entry, deltaRow, deltaCol) {
    const nextEntry = cloneCellEntry(entry);
    nextEntry.raw = translateFormula(nextEntry.raw, deltaRow, deltaCol);
    return nextEntry;
  }

  function getCellEntry(cellId) {
    return cellData.get(cellId) ?? createEmptyCellEntry();
  }

  function setCellEntry(cellId, entry) {
    cellData.set(cellId, cloneCellEntry(entry));
    scheduleSave();
  }

  function refreshAllCells() {
    const cells = sheetRoot.querySelectorAll(".calc-sheet-cell[data-editable='true']");
    cells.forEach((cell) => {
      const entry = getCellEntry(cell.dataset.cell);
      applyCellStyle(cell, entry);
      cell.classList.toggle("has-formula", entry.raw.startsWith("="));
      cell.classList.toggle("is-numeric", isNumericDisplay(entry.raw));
      cell.classList.toggle("is-draggable", cell.classList.contains("is-view") && isCellDraggable(cell.dataset.cell));
      if (cell.dataset.cell === activeCellId && !cell.classList.contains("is-view")) return;
      cell.textContent = formatDisplayValue(entry.raw);
    });
  }

  function scheduleSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    hasPendingSave = true;
    updateSaveIndicator();
    saveTimer = setTimeout(() => {
      saveSheetState();
    }, 1000);
  }

  function formatDisplayValue(raw) {
    if (!raw) return "";
    if (raw.startsWith("=")) {
      const result = evaluateFormula(raw.slice(1));
      return Number.isFinite(result) ? formatNumber(result) : "ERR";
    }
    if (isNumericString(raw)) {
      const value = Number.parseFloat(normalizeDecimal(raw));
      return formatNumber(value);
    }
    return raw;
  }

  function isNumericDisplay(raw) {
    if (!raw) return false;
    if (raw.startsWith("=")) {
      const result = evaluateFormula(raw.slice(1));
      return Number.isFinite(result);
    }
    return isNumericString(raw);
  }

  function evaluateFormula(expression, stack = []) {
    if (!expression) return NaN;

    const withSum = expression.replace(/SUM\(([^)]+)\)/gi, (_, args) => {
      const sum = computeSum(args, stack);
      return Number.isFinite(sum) ? String(sum) : "NaN";
    });

    const withValues = withSum.replace(/\b([A-K])([1-9]|[12][0-9]|3[0-2])\b/g, (match, col, row) => {
      const cellId = `${col}${row}`;
      const value = getNumericValue(cellId, stack);
      return Number.isFinite(value) ? String(value) : "NaN";
    });

    if (/[^0-9+\-*/().\s]/.test(withValues)) {
      return NaN;
    }

    try {
      const result = Function(`"use strict"; return (${withValues});`)();
      return typeof result === "number" ? roundToDecimals(result, 3) : NaN;
    } catch {
      return NaN;
    }
  }

  function computeSum(args, stack) {
    if (!args) return 0;
    const tokens = args
      .split(/[,;]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    let sum = 0;

    tokens.forEach((token) => {
      const rangeMatch = /^([A-K])([1-9]|[12][0-9]|3[0-2])\s*:\s*([A-K])([1-9]|[12][0-9]|3[0-2])$/i.exec(
        token
      );
      if (rangeMatch) {
        const startCol = columnLabels.indexOf(rangeMatch[1].toUpperCase());
        const startRow = Number.parseInt(rangeMatch[2], 10);
        const endCol = columnLabels.indexOf(rangeMatch[3].toUpperCase());
        const endRow = Number.parseInt(rangeMatch[4], 10);
        if (startCol < 0 || endCol < 0) return;
        const colFrom = Math.min(startCol, endCol);
        const colTo = Math.max(startCol, endCol);
        const rowFrom = Math.min(startRow, endRow);
        const rowTo = Math.max(startRow, endRow);
        for (let row = rowFrom; row <= rowTo; row += 1) {
          for (let col = colFrom; col <= colTo; col += 1) {
            const cellId = `${columnLabels[col]}${row}`;
            const value = getNumericValue(cellId, stack);
            if (Number.isFinite(value)) sum += value;
          }
        }
        return;
      }

      const singleMatch = /^([A-K])([1-9]|[12][0-9]|3[0-2])$/i.exec(token);
      if (singleMatch) {
        const cellId = `${singleMatch[1].toUpperCase()}${singleMatch[2]}`;
        const value = getNumericValue(cellId, stack);
        if (Number.isFinite(value)) sum += value;
        return;
      }

      if (isNumericString(token)) {
        const value = Number.parseFloat(normalizeDecimal(token));
        if (Number.isFinite(value)) sum += value;
      }
    });

    return roundToDecimals(sum, 3);
  }

  function getNumericValue(cellId, stack) {
    if (stack.includes(cellId)) return NaN;
    const raw = getRawValue(cellId);
    if (!raw) return 0;
    if (raw.startsWith("=")) {
      return evaluateFormula(raw.slice(1), [...stack, cellId]);
    }
    const value = Number.parseFloat(normalizeDecimal(raw));
    return Number.isFinite(value) ? roundToDecimals(value, 3) : 0;
  }



  function formatNumber(value) {
    if (!Number.isFinite(value)) return "ERR";
    return value.toFixed(3).replace(".", ",");
  }

  function translateFormula(raw, deltaRow, deltaCol) {
    if (!raw || !raw.startsWith("=")) return raw;
    return raw.replace(/\b([A-K])([1-9]|[12][0-9]|3[0-2])\b/g, (match, col, row) => {
      const colIndex = columnLabels.indexOf(col);
      if (colIndex < 0) return match;
      let nextCol = colIndex + deltaCol;
      let nextRow = Number.parseInt(row, 10) + deltaRow;
      if (Number.isNaN(nextRow)) return match;
      if (nextCol < 0) nextCol = 0;
      if (nextCol >= COLS) nextCol = COLS - 1;
      if (nextRow < 1) nextRow = 1;
      if (nextRow > ROWS) nextRow = ROWS;
      return `${columnLabels[nextCol]}${nextRow}`;
    });
  }

  function colorToValue(color) {
    if (color === "blue") return "var(--sheet-text-blue, #1f4aa8)";
    if (color === "red") return "var(--sheet-text-red, #b7261d)";
    if (color === "green") return "var(--sheet-text-green, #0b7a3a)";
    return "var(--sheet-text)";
  }

  function applyCellStyle(cell, entry) {
    cell.style.fontWeight = entry.bold ? "700" : "400";
    cell.style.color = colorToValue(entry.color);
  }

  function updateToolbarState() {
    if (!toolbar || !activeCellId) return;
    const entry = getCellEntry(activeCellId);
    const buttons = toolbar.querySelectorAll("[data-sheet-action]");
    buttons.forEach((button) => {
      const action = button.dataset.sheetAction;
      if (action === "bold") {
        button.classList.toggle("is-active", entry.bold);
        button.setAttribute("aria-pressed", entry.bold ? "true" : "false");
      }
      if (action === "color") {
        const isActive = entry.color === button.dataset.color;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      }
    });
  }

  function updateFormulaBar(cellId) {
    if (!formulaBar) return;
    const raw = getRawValue(cellId);
    if (raw.startsWith("=")) {
      formulaBar.textContent = raw;
      formulaBar.classList.remove("is-empty");
    } else {
      formulaBar.textContent = "fx";
      formulaBar.classList.add("is-empty");
    }
  }

  refreshAllCells();

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadSheetState() {
    if (!("indexedDB" in window)) return;
    try {
      const db = await openDb();
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(SHEET_KEY);
      const data = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (data && typeof data === "object") {
        Object.entries(data).forEach(([cellId, entry]) => {
          if (cellElements.has(cellId)) {
            cellData.set(cellId, entry);
          }
        });
      }
      db.close();
    } catch {
      // ignore persistence errors
    }
  }

  async function saveSheetState() {
    if (!("indexedDB" in window)) return;
    try {
      const db = await openDb();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const payload = {};
      cellData.forEach((entry, cellId) => {
        payload[cellId] = entry;
      });
      store.put(payload, SHEET_KEY);
      transaction.oncomplete = () => {
        db.close();
        hasPendingSave = false;
        updateSaveIndicator();
      };
      transaction.onerror = () => {
        db.close();
        hasPendingSave = false;
        updateSaveIndicator();
      };
    } catch {
      // ignore persistence errors
      hasPendingSave = false;
      updateSaveIndicator();
    }
  }

  function updateSaveIndicator() {
    if (!saveIndicator) return;
    saveIndicator.classList.toggle("is-active", hasPendingSave);
  }
}

initCalcSheet();

export { initCalcSheet };
