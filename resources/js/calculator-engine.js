import { applyRounding } from './utils/number-utils.js';

const NON_EDITABLE_KEYS = new Set([
    'T1', 'S1', 'GT', 'C', 'CLEAR_ALL', 'CONST', 'RATE', 'EXPR'
]);

const CHECKPOINT_KEYS = new Set([
    '+', '-', 'x', '÷', '=', 'Enter', '(', ')',
    'T', 'T1', 'S', 'S1', '%', 'Δ', '√', '^',
    'RATE', 'TAX+', 'TAX-', 'COST', 'SELL', 'MARGIN', 'MARKUP',
    'CLEAR_ALL', 'M+', 'M-', 'MR', 'MC'
]);

const EXPRESSION_OPERATORS = new Set(['+', '-', 'x', '÷', '^']);

const EXPRESSION_PRECEDENCE = {
    '+': 1,
    '-': 1,
    'x': 2,
    '÷': 2,
    '^': 3
};

const RIGHT_ASSOCIATIVE_OPERATORS = new Set(['^']);

class CalculatorEngine {
    constructor(settings = {}) {
        // --- STATE ---
        this.entries = [];
        this.currentInput = "0";
        this.accumulator = 0;
        this.grandTotal = 0;
        
        this.pendingMultDivOp = null;
        this.multDivOperand = null;
        this.isReplaying = false; // Flag to prevent history duplication during recalculation
        
        // Input State
        this.isNewSequence = true;
        this.errorState = false;
        this.totalPendingState = { 1: false };
        this.lastOperation = null; // Stores { op: 'x', operand: 10 } for constant calc
        this.lastAddSubValue = null;
        this.lastAddSubOp = null;
        // Add/Sub chaining state
        this.pendingAddSubOp = null;
        this.addSubOperand = null;
        this.addSubResults = [];
        this.lastMultDivResult = null;
        this.awaitingMultDivTotal = false;
        this.multDivTotalPendingClear = false;
        this.multDivResults = [];
        this.gtPending = false;
        this.resultRecallStage = 0;
        this.subtotalPendingFinalize = false;
        this.pendingDelta = null;
        this.pendingPowerBase = null;
        this.addModeBuffer = "";
        this.expressionTokens = [];
        this.expressionOpenCount = 0;
        this.isExpressionMode = false;

        // Undo/Redo
        this.undoStack = [];
        this.redoStack = [];

        // Memory
        this.memoryRegister = 0;
        this.memoryStack = [];
        this.memoryMode = 'algebraic'; // 'algebraic' | 'stack'
        this.memoryMax = 8;

        // Business Logic State
        this.taxRate = 22; // Default
        this.marginPercent = 0;
        this.markupPercent = 0;
        this.costValue = null;
        this.sellValue = null;
        this.pricingMode = 'margin'; // 'margin' | 'markup'
        this.awaitingRate = false;

        // Settings (default)
        this.settings = {
            roundingMode: 'none',   // none, truncate, up
            decimals: 2,
            isFloat: false,
            addMode: false,
            accumulateGT: false, // Will be set by switch
            ...settings
        };
        
        // Callbacks for UI updates (to be assigned by UI)
        this.onDisplayUpdate = (val) => {};
        this.onStatusUpdate = (status) => {}; // New: { acc1: bool, acc2: bool, gt: bool, error: bool, minus: bool }
        this.onTapePrint = (entry) => {};
        this.onTapeRefresh = (entries) => {}; 
        this.onError = (msg) => {};
        this.onMemoryUpdate = (memory) => {};
        this.onRateUpdate = (rate) => {};
        this.onBeforeClearAll = async (snapshot) => {}; // Called before CLEAR_ALL, pass current state
    }

    // --- SETTINGS ---
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        if (newSettings && typeof newSettings.memoryMode === 'string') {
            this.memoryMode = newSettings.memoryMode;
            this._emitMemoryUpdate();
        }
    }

    // --- UNDO / REDO ---
    _snapshotEntries(entries = this.entries) {
        return entries.map((entry) => ({ ...entry }));
    }

    _checkpoint() {
        if (this.isReplaying) return;
        this.undoStack.push(this._snapshotEntries());
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack = [];
    }

    _restoreSnapshot(snapshot) {
        this.entries = this._snapshotEntries(snapshot || []);
        if (this.onTapeRefresh) {
            this.onTapeRefresh(this.entries);
        }
        this._recalculate();
    }

    undo() {
        if (this.undoStack.length === 0) return false;
        const snapshot = this.undoStack.pop();
        this.redoStack.push(this._snapshotEntries());
        this._restoreSnapshot(snapshot);
        return true;
    }

    redo() {
        if (this.redoStack.length === 0) return false;
        const snapshot = this.redoStack.pop();
        this.undoStack.push(this._snapshotEntries());
        this._restoreSnapshot(snapshot);
        return true;
    }

    /**
     * Edit the numeric value of a tape entry and recalculate the full tape.
     * Only 'input' entries with user-typed values can be edited.
     * @param {number} index - position in this.entries
     * @param {number} newVal - replacement numeric value
     * @returns {boolean} true if the edit was applied
     */
    editEntry(index, newVal) {
        if (index < 0 || index >= this.entries.length) return false;
        const entry = this.entries[index];
        if (!entry || entry.type !== 'input') return false;

        // Keys that represent computed/structural rows — not editable
        if (NON_EDITABLE_KEYS.has(entry.key)) return false;

        this._checkpoint();
        entry.val = newVal;
        this._recalculate();

        // Refresh tape UI with rebuilt entries
        if (this.onTapeRefresh) {
            this.onTapeRefresh(this.entries);
        }
        this._emitStatus();
        return true;
    }

    _shouldCheckpoint(key) {
        return CHECKPOINT_KEYS.has(key);
    }

    _emitMemoryUpdate() {
        if (!this.onMemoryUpdate) return;
        const hasStack = this.memoryStack.length > 0;
        const hasRegister = this.memoryRegister !== 0;
        this.onMemoryUpdate({
            mode: this.memoryMode,
            stack: [...this.memoryStack],
            memory: this.memoryRegister,
            hasMemory: this.memoryMode === 'stack' ? hasStack : hasRegister,
        });
    }

    _accumulateGT(val) {
        if (val === null || typeof val === 'undefined' || isNaN(val)) return;
        this.grandTotal += Number(val);
        this.grandTotal = parseFloat(Number(this.grandTotal).toPrecision(15));
    }
    
    // --- STATUS ---
    _emitStatus() {
        if (this.onStatusUpdate) {
            this.onStatusUpdate({
                acc1: this.accumulator !== 0,
                acc2: false,
                gt: this.grandTotal !== 0,
                error: this.errorState,
                minus: parseFloat(this.currentInput) < 0 || (this.currentInput === '0' && this.accumulator < 0 && !this.isNewSequence)
            });
        }
    }
    
    // --- STATE RECALCULATION ---
    _recalculate() {
        // 1. Save and Clear
        const savedEntries = [...this.entries];
        this.entries = [];
        
        // 2. Reset State
        this.accumulator = 0;
        this.grandTotal = 0;
        this.pendingMultDivOp = null;
        this.multDivOperand = null;
        this.currentInput = "0";
        this.isNewSequence = true;
        this.totalPendingState = { 1: false };
        this.errorState = false;
        this.gtPending = false; // New state for GT key
        this.resultRecallStage = 0;
        this.subtotalPendingFinalize = false;
        this.isReplaying = true;
        this.lastOperation = null;
        this.lastAddSubValue = null;
        this.lastAddSubOp = null;
        this.lastMultDivResult = null;
        this.awaitingMultDivTotal = false;
        this.multDivResults = [];
        this.multDivTotalPendingClear = false;
        this.pendingDelta = null;
        this.pendingPowerBase = null;
        this.expressionTokens = [];
        this.expressionOpenCount = 0;
        this.isExpressionMode = false;

        try {
            for (const entry of savedEntries) {
                if (entry.type === 'input') {
                    // Logic dispatch
                    if (entry.key === '%') {
                        // Replay: set currentInput and let _handlePercent resolve
                        // against current pending state (mult/div or add/sub)
                        this.currentInput = String(entry.val);
                        this.isNewSequence = false;
                        this._handlePercent();
                    } else if (entry.key === 'Δ') {
                        this._handleDelta(entry.val, 'first');
                    } else if (entry.key === 'Δ2') {
                        this._handleDelta(entry.val, 'second');
                    } else if (entry.key === '√') {
                        this._handleSqrt(entry.val);
                    } else if (entry.key === '^') {
                        this._handlePower(entry.val, 'first');
                    } else if (entry.key === 'POW2') {
                        this._handlePower(entry.val, 'second');
                    } else if (['+', '-'].includes(entry.key)) {
                        this._handleAddSub(entry.key, entry.val); 
                    } else if (['x', '÷'].includes(entry.key)) {
                        this._handleMultDiv(entry.key, entry.val);
                    } else if (entry.key === '=' || entry.key === 'Enter' || entry.key === 'T' || entry.key === 'T1') {
                        this._handleEqual(entry.val, entry.key);
                    } else if (entry.key === 'S' || entry.key === 'S1') {
                        this._handleSubTotal(1);
                    } else if (entry.key === 'GT') {
                        this._handleGrandTotal();
                    } else if (entry.key === 'EXPR') {
                        this._handleExpressionReplay(entry);
                    }
                }
            }
        } catch (e) {
            console.error("Replay Error", e);
            this._triggerError("Error Recalc");
        } finally {
            this.isReplaying = false;
            // Restore Display
            if (this.pendingMultDivOp) {
                 this.onDisplayUpdate(this._formatResult(this.multDivOperand));
            } else if (this.accumulator !== 0) {
                 this.onDisplayUpdate(this._formatResult(this.accumulator));
            } else {
                 this.onDisplayUpdate(this.currentInput);
            }
        }
    }
    
    // --- INPUT DISPATCH ---
    // Main entry point for inputs
    pressKey(key) {
        if (this.errorState && key !== 'CLEAR_ALL' && key !== 'CE') return;

        const isResultKey = key === '=' || key === 'Enter' || key === 'T' || key === 'T1';
        if (!isResultKey) {
            this.resultRecallStage = 0;
        }

        if (!isResultKey && key !== 'S' && key !== 'S1') {
            this.subtotalPendingFinalize = false;
        }

        if (this._shouldCheckpoint(key)) {
            this._checkpoint();
        }

        // Rate Confirmation Logic
        if (this.awaitingRate) {
             const isNumeric = (!isNaN(parseFloat(key)) || key === '00' || key === '000' || key === '.');
             if (key === '=' || key === 'Enter' || key === 'T' || key === 'T1') {
                 const rateVal = parseFloat(this.currentInput);
                 if (!isNaN(rateVal)) {
                     this.taxRate = rateVal;
                     if (this.onRateUpdate) this.onRateUpdate(this.taxRate);
                 }
                 this.awaitingRate = false;
                 this._clearAll();
                 return;
             }
             if (!isNumeric) {
                 return;
             }
        }

        if (this.isExpressionMode || key === '(' || key === ')') {
            const handledExpressionKey = this._handleExpressionKey(key);
            if (handledExpressionKey || this.isExpressionMode) {
                return;
            }
        }

        // Numeric Input
        if (!isNaN(parseFloat(key)) || key === '00' || key === '000') {
            this._handleNumber(key);
            return;
        }
        if (key === '.') {
            this._handleDecimal();
            return;
        }

        // Operations
        switch(key) {
            case '+':
            case '-':
                this._handleAddSub(key);
                break;
            case 'x':
            case '÷':
                this._handleMultDiv(key);
                break;
            case '=':
            case 'Enter':
            case 'T':
            case 'T1':
                this._handleEqual(null, key);
                break;
            case 'S':
            case 'S1':
                this._handleSubTotal(1);
                break;
            case '%':
                this._handlePercent();
                break;
            case 'Δ':
                this._handleDelta();
                break;
            case '√':
                this._handleSqrt();
                break;
            case '^':
                this._handlePower();
                break;
            case 'GT':
                this._handleGrandTotal();
                break;

            // Business Keys
            case 'RATE':
            case 'TAX+':
            case 'TAX-':
            case 'COST':
            case 'SELL':
            case 'MARGIN':
            case 'MARKUP':
                this._handleBusinessKey(key);
                break;
                
            // Clear handling needs to be coordinated with UI usually, 
            // but engine state part is here
            case 'CLEAR_ALL':
                this._clearAll();
                break;
            case 'CE':
                this._clearEntry();
                break;
            case 'BACKSPACE':
                this._handleBackspace();
                break;
            case '±':
                this._toggleSign();
                break;
            case 'M+':
            case 'M-':
            case 'MR':
            case 'MC':
                this._handleMemoryKey(key);
                break;
        }
    }

    // --- INPUT HANDLERS ---
    _handleNumber(digits) {
        this.subtotalPendingFinalize = false;
        if (this.settings.addMode) {
            if (this.isNewSequence || this.currentInput === "0") {
                this.addModeBuffer = "";
            }
            const addDigits = String(digits);
            const buffer = (this.addModeBuffer || "") + addDigits;
            if (buffer.length > 16) return;
            this.addModeBuffer = buffer;

            const raw = this.addModeBuffer || "0";
            let intPart = "0";
            let fracPart = "00";
            if (raw.length <= 2) {
                fracPart = raw.padStart(2, "0");
            } else {
                intPart = raw.slice(0, -2);
                fracPart = raw.slice(-2);
            }
            this.currentInput = `${intPart}.${fracPart}`;
            this.isNewSequence = false;
            if (!this.isReplaying) this.onDisplayUpdate(this.currentInput);
            return;
        }
        // Se stavamo attendendo un totale da catena mult/div e l'utente riprende a digitare, azzera lo stato catena
        if (this.awaitingMultDivTotal && this.isNewSequence && !this.pendingMultDivOp) {
            this.awaitingMultDivTotal = false;
            this.lastMultDivResult = null;
            this.multDivResults = [];
            this.multDivTotalPendingClear = false;
        }
        // Reset Total Pending State on numeric input
        this.totalPendingState[1] = false;

        if (this.currentInput === "0" || this.isNewSequence) {
            this.currentInput = digits;
            this.isNewSequence = false;
        } else {
            if (this.currentInput.replace('.', '').length < 16) {
                this.currentInput += digits;
            }
        }
        if (!this.isReplaying) this.onDisplayUpdate(this.currentInput);
    }

    _handleDecimal() {
        this.subtotalPendingFinalize = false;
        if (this.settings.addMode) {
            return;
        }
        if (this.awaitingMultDivTotal && this.isNewSequence && !this.pendingMultDivOp) {
            this.awaitingMultDivTotal = false;
            this.lastMultDivResult = null;
            this.multDivResults = [];
            this.multDivTotalPendingClear = false;
        }
        if (this.isNewSequence) {
            this.currentInput = "0.";
            this.isNewSequence = false;
        } else if (!this.currentInput.includes('.')) {
            this.currentInput += ".";
        }
        if (!this.isReplaying) this.onDisplayUpdate(this.currentInput);
    }

    _resetExpressionState() {
        this.expressionTokens = [];
        this.expressionOpenCount = 0;
        this.isExpressionMode = false;
    }

    _isExpressionOperator(token) {
        return EXPRESSION_OPERATORS.has(token);
    }

    _isExpressionValueToken(token) {
        if (typeof token !== 'string') return false;
        if (token.trim() === '') return false;
        return !isNaN(Number(token));
    }

    _getExpressionPreview() {
        const tokens = [...this.expressionTokens];
        if (!this.isNewSequence) {
            tokens.push(this.currentInput);
        }
        if (tokens.length === 0) return '0';
        return tokens.join(' ');
    }

    _pushExpressionValueToken() {
        if (this.isNewSequence) return true;
        const raw = this.currentInput;
        if (raw === '-') return false;
        const parsed = Number(raw);
        if (isNaN(parsed)) return false;
        this.expressionTokens.push(String(parsed));
        this.currentInput = '0';
        this.isNewSequence = true;
        return true;
    }

    _updateExpressionDisplay() {
        if (!this.isReplaying) this.onDisplayUpdate(this._getExpressionPreview());
    }

    _handleExpressionNumber(digits) {
        if (this.isNewSequence || this.currentInput === '0') {
            this.currentInput = String(digits);
            this.isNewSequence = false;
        } else {
            if (this.currentInput.replace('.', '').length >= 16) return;
            this.currentInput += String(digits);
        }
        this._updateExpressionDisplay();
    }

    _handleExpressionDecimal() {
        if (this.isNewSequence) {
            this.currentInput = '0.';
            this.isNewSequence = false;
            this._updateExpressionDisplay();
            return;
        }
        if (this.currentInput.includes('.')) return;
        this.currentInput += '.';
        this._updateExpressionDisplay();
    }

    _handleExpressionOpenParen() {
        const committed = this._pushExpressionValueToken();
        if (!committed) return;

        const last = this.expressionTokens[this.expressionTokens.length - 1];
        if (this._isExpressionValueToken(last) || last === ')') {
            this.expressionTokens.push('x');
        }

        this.expressionTokens.push('(');
        this.expressionOpenCount += 1;
        this.isExpressionMode = true;
        this.currentInput = '0';
        this.isNewSequence = true;
        this._updateExpressionDisplay();
    }

    _handleExpressionCloseParen() {
        if (this.expressionOpenCount <= 0) return;
        const committed = this._pushExpressionValueToken();
        if (!committed) return;

        const last = this.expressionTokens[this.expressionTokens.length - 1];
        if (!last || this._isExpressionOperator(last) || last === '(') return;

        this.expressionTokens.push(')');
        this.expressionOpenCount -= 1;
        this.isExpressionMode = true;
        this._updateExpressionDisplay();
    }

    _handleExpressionOperator(op) {
        const tokensLen = this.expressionTokens.length;
        const last = tokensLen > 0 ? this.expressionTokens[tokensLen - 1] : null;
        const unaryMinusAllowed = op === '-' &&
            (tokensLen === 0 || last === '(' || this._isExpressionOperator(last));

        if (unaryMinusAllowed && this.isNewSequence) {
            this.currentInput = '-';
            this.isNewSequence = false;
            this.isExpressionMode = true;
            this._updateExpressionDisplay();
            return;
        }

        const committed = this._pushExpressionValueToken();
        if (!committed) {
            this._triggerError('Error');
            return;
        }

        const currentLast = this.expressionTokens[this.expressionTokens.length - 1];
        if (!currentLast || currentLast === '(') return;

        if (this._isExpressionOperator(currentLast)) {
            this.expressionTokens[this.expressionTokens.length - 1] = op;
        } else {
            this.expressionTokens.push(op);
        }

        this.currentInput = '0';
        this.isNewSequence = true;
        this.isExpressionMode = true;
        this._updateExpressionDisplay();
    }

    _handleExpressionBackspace() {
        if (!this.isNewSequence && this.currentInput.length > 0) {
            this.currentInput = this.currentInput.slice(0, -1);
            if (this.currentInput === '' || this.currentInput === '-') {
                this.currentInput = '0';
                this.isNewSequence = true;
            }
            this._updateExpressionDisplay();
            return;
        }

        if (this.expressionTokens.length === 0) return;
        const removed = this.expressionTokens.pop();
        if (removed === '(') this.expressionOpenCount = Math.max(0, this.expressionOpenCount - 1);
        if (removed === ')') this.expressionOpenCount += 1;
        this._updateExpressionDisplay();
    }

    _evaluateExpressionTokens(tokens) {
        const outputQueue = [];
        const operatorStack = [];

        for (const token of tokens) {
            if (this._isExpressionValueToken(token)) {
                outputQueue.push(token);
                continue;
            }

            if (this._isExpressionOperator(token)) {
                while (operatorStack.length > 0) {
                    const stackTop = operatorStack[operatorStack.length - 1];
                    if (!this._isExpressionOperator(stackTop)) break;

                    const currentPrecedence = EXPRESSION_PRECEDENCE[token];
                    const stackPrecedence = EXPRESSION_PRECEDENCE[stackTop];
                    const isRightAssociative = RIGHT_ASSOCIATIVE_OPERATORS.has(token);

                    const shouldPop = isRightAssociative
                        ? currentPrecedence < stackPrecedence
                        : currentPrecedence <= stackPrecedence;

                    if (!shouldPop) break;
                    outputQueue.push(operatorStack.pop());
                }

                operatorStack.push(token);
                continue;
            }

            if (token === '(') {
                operatorStack.push(token);
                continue;
            }

            if (token === ')') {
                let foundOpenParen = false;
                while (operatorStack.length > 0) {
                    const top = operatorStack.pop();
                    if (top === '(') {
                        foundOpenParen = true;
                        break;
                    }
                    outputQueue.push(top);
                }
                if (!foundOpenParen) throw new Error('ExpressionParenthesesMismatch');
            }
        }

        while (operatorStack.length > 0) {
            const op = operatorStack.pop();
            if (op === '(' || op === ')') throw new Error('ExpressionParenthesesMismatch');
            outputQueue.push(op);
        }

        const evalStack = [];
        for (const token of outputQueue) {
            if (this._isExpressionValueToken(token)) {
                evalStack.push(Number(token));
                continue;
            }

            if (!this._isExpressionOperator(token)) {
                throw new Error('ExpressionInvalidToken');
            }

            if (evalStack.length < 2) {
                throw new Error('ExpressionInvalidSyntax');
            }

            const right = evalStack.pop();
            const left = evalStack.pop();
            let partial = 0;
            if (token === '+') partial = left + right;
            else if (token === '-') partial = left - right;
            else if (token === 'x') partial = left * right;
            else if (token === '÷') {
                if (right === 0) throw new Error('DivisionByZero');
                partial = left / right;
            } else if (token === '^') {
                partial = Math.pow(left, right);
            }

            evalStack.push(partial);
        }

        if (evalStack.length !== 1) {
            throw new Error('ExpressionInvalidSyntax');
        }

        return evalStack[0];
    }

    _executeExpressionTokens(tokens, expressionText = null) {
        const resultRaw = this._evaluateExpressionTokens(tokens);
        const roundedResult = this._applyRoundingWithFlag(resultRaw);
        const result = roundedResult.value;
        const expressionForTape = expressionText || tokens.join(' ');

        this._addHistoryEntry({
            val: expressionForTape,
            symbol: '=',
            key: 'EXPR',
            type: 'input',
            expression: expressionForTape,
            expressionTokens: [...tokens]
        });

        this._addHistoryEntry({
            val: this._formatResult(result),
            symbol: '',
            key: '=',
            type: 'result',
            roundingFlag: roundedResult.roundingFlag,
            roundingRawValue: roundedResult.rawValue
        });

        this.accumulator += result;
        this.accumulator = parseFloat(Number(this.accumulator).toPrecision(15));
        this._accumulateGT(result);

        const accumRounded = this._applyRoundingWithFlag(this.accumulator);
        this._addHistoryEntry({
            val: this._formatResult(accumRounded.value),
            symbol: 'S',
            key: 'S',
            type: 'result',
            roundingFlag: accumRounded.roundingFlag,
            roundingRawValue: accumRounded.rawValue
        });

        if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(result));

        this.currentInput = String(result);
        this.isNewSequence = true;
        this.lastOperation = null;
        this.pendingAddSubOp = null;
        this.addSubOperand = null;
        this.addSubResults = [];
        this.pendingMultDivOp = null;
        this.multDivOperand = null;
        this.awaitingMultDivTotal = false;
        this.lastMultDivResult = null;
        this.multDivResults = [];
        this.multDivTotalPendingClear = false;
        this.pendingDelta = null;
        this.pendingPowerBase = null;
        this._resetExpressionState();
        this._emitStatus();
    }

    _handleExpressionReplay(entry) {
        const tokens = Array.isArray(entry.expressionTokens) ? [...entry.expressionTokens] : null;
        if (!tokens || tokens.length === 0) return;
        this._executeExpressionTokens(tokens, entry.expression || String(entry.val));
    }

    _handleExpressionKey(key) {
        if (key === 'CLEAR_ALL') {
            this._clearAll();
            return true;
        }

        if (key === 'CE') {
            this.currentInput = '0';
            this.isNewSequence = true;
            this._updateExpressionDisplay();
            return true;
        }

        if (key === 'BACKSPACE') {
            this._handleExpressionBackspace();
            return true;
        }

        if (!isNaN(parseFloat(key)) || key === '00' || key === '000') {
            this._handleExpressionNumber(key);
            this.isExpressionMode = true;
            return true;
        }

        if (key === '.') {
            this._handleExpressionDecimal();
            this.isExpressionMode = true;
            return true;
        }

        if (key === '(') {
            this._handleExpressionOpenParen();
            return true;
        }

        if (key === ')') {
            this._handleExpressionCloseParen();
            return true;
        }

        if (this._isExpressionOperator(key)) {
            this._handleExpressionOperator(key);
            return true;
        }

        if (key === '=' || key === 'Enter') {
            const committed = this._pushExpressionValueToken();
            if (!committed || this.expressionTokens.length === 0) {
                this._triggerError('Error');
                this._resetExpressionState();
                return true;
            }
            if (this.expressionOpenCount !== 0) {
                this._triggerError('Error');
                this._resetExpressionState();
                return true;
            }

            const last = this.expressionTokens[this.expressionTokens.length - 1];
            if (!last || this._isExpressionOperator(last) || last === '(') {
                this._triggerError('Error');
                this._resetExpressionState();
                return true;
            }

            try {
                this._executeExpressionTokens([...this.expressionTokens]);
            } catch (error) {
                if (!this.isReplaying) this._triggerError('Error');
                this._resetExpressionState();
            }
            return true;
        }

        return false;
    }

    _handleAddSub(op, explicitVal = null) {
        this.subtotalPendingFinalize = false;
        if (this.totalPendingState[1]) {
            this.totalPendingState[1] = false;
            this.accumulator = 0;
            this.lastAddSubValue = null;
        }
        if (this.pendingDelta !== null) {
            this.pendingDelta = null;
        }
        if (this.pendingPowerBase !== null) {
            this.pendingPowerBase = null;
        }
        // If we're already waiting for the next operand (user pressed an operator
        // and didn't type the second operand yet), subsequent operator presses
        // should not emit a new tape entry. If the operator changes (from + to -
        // or viceversa), update the pending operator and refresh the tape UI.
        // During replay (explicitVal provided) always process — isNewSequence stays
        // true between replayed entries because no digit input occurs. @2026-02-08
        if (this.pendingAddSubOp && this.isNewSequence && explicitVal === null) {
            if (op === this.pendingAddSubOp) {
                return; // no effect
            }
            // change pending operator symbol in history if present
            for (let i = this.entries.length - 1; i >= 0; i--) {
                const e = this.entries[i];
                if (e && e.type === 'input' && (e.key === '+' || e.key === '-')) {
                    e.symbol = op;
                    e.key = op;
                    break;
                }
            }
            this.pendingAddSubOp = op;
            if (this.onTapeRefresh) this.onTapeRefresh(this.entries);
            this._emitStatus();
            return;
        }

        // Exiting mult/div chain: clear its state
        this.awaitingMultDivTotal = false;
        this.lastMultDivResult = null;
        this.multDivResults = [];
        this.pendingMultDivOp = null;
        this.multDivTotalPendingClear = false;

        // Also exit any previous add/sub chain if needed
        // (we will manage chaining for add/sub similarly to mult/div)

        let val;
        if (explicitVal !== null) {
            val = explicitVal;
        } else if (this.isNewSequence && this.lastAddSubValue !== null && this.currentInput === "0") {
            val = this.lastAddSubValue;
        } else {
            val = parseFloat(this.currentInput);
        }
        if (isNaN(val)) val = 0;

        // If there's already a pending add/sub operation, and the user typed a new operand,
        // compute the intermediate result first (chain behaviour), mirroring mult/div logic.
        if (!this.pendingAddSubOp) {
            // First term in add/sub chain
            this.addSubResults = [];
            this.addSubOperand = val;
        } else {
            if (!this.isNewSequence || explicitVal !== null) {
                let interRes = 0;
                if (this.pendingAddSubOp === '+') {
                    interRes = this.addSubOperand + val;
                } else if (this.pendingAddSubOp === '-') {
                    interRes = this.addSubOperand - val;
                }

                interRes = this._applyRounding(interRes);
                this.addSubResults.push(interRes);
                this.addSubOperand = interRes;
                if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(interRes));
            } else {
                // If isNewSequence, keep operand as-is (user pressed op twice)
            }
        }

        this.pendingAddSubOp = op;
        this._addHistoryEntry({ val, symbol: op, key: op, type: 'input' });

        this.currentInput = "0";
        this.isNewSequence = true;
    }

    _handleMemoryKey(key) {
        if (this.memoryMode === 'stack') {
            this._handleStackMemory(key);
        } else {
            this._handleAlgebraicMemory(key);
        }
        this._emitMemoryUpdate();
    }

    _readInputValue() {
        const val = parseFloat(this.currentInput);
        return isNaN(val) ? null : val;
    }

    _resolveUnaryBaseValue() {
        const parsed = parseFloat(this.currentInput);
        const hasExplicitInput = !this.isNewSequence || this.currentInput !== "0";
        if (!isNaN(parsed) && hasExplicitInput) return parsed;
        if (this.pendingMultDivOp && this.multDivOperand !== null && this.isNewSequence) return this.multDivOperand;
        if (this.pendingAddSubOp && this.addSubOperand !== null && this.isNewSequence) return this.addSubOperand;
        if (this.accumulator !== 0 && this.isNewSequence) return this.accumulator;
        if (!isNaN(parsed)) return parsed;
        return null;
    }

    _handleAlgebraicMemory(key) {
        const val = this._readInputValue();
        if (key === 'M+') {
            if (val !== null) this.memoryRegister += val;
        } else if (key === 'M-') {
            if (val !== null) this.memoryRegister -= val;
        } else if (key === 'MR') {
            this.currentInput = String(this.memoryRegister);
            this.isNewSequence = true;
            if (!this.isReplaying) this.onDisplayUpdate(this.currentInput);
        } else if (key === 'MC') {
            this.memoryRegister = 0;
        }
    }

    _handleStackMemory(key) {
        const val = this._readInputValue();
        if (key === 'M+') {
            if (val !== null && val !== 0) {
                if (this.memoryStack.length >= this.memoryMax) {
                    this.memoryStack.shift();
                }
                this.memoryStack.push(val);
            }
        } else if (key === 'M-') {
            if (this.memoryStack.length === 0) return;
            if (val !== null) {
                const target = Math.round(val * 1000) / 1000;
                let idx = -1;
                for (let i = this.memoryStack.length - 1; i >= 0; i--) {
                    const candidate = Math.round(this.memoryStack[i] * 1000) / 1000;
                    if (candidate === target) {
                        idx = i;
                        break;
                    }
                }
                if (idx >= 0) {
                    this.memoryStack.splice(idx, 1);
                } else {
                    this.memoryStack.pop();
                }
            } else {
                this.memoryStack.pop();
            }
        } else if (key === 'MR') {
            if (this.memoryStack.length === 0) return;
            const top = this.memoryStack.pop();
            this.currentInput = String(top);
            this.isNewSequence = true;
            if (!this.isReplaying) this.onDisplayUpdate(this.currentInput);
        } else if (key === 'MC') {
            this.memoryStack = [];
        }
    }

    _handleMultDiv(op, explicitVal = null) {
        if (this.pendingDelta !== null) {
            this.pendingDelta = null;
        }
        if (this.pendingPowerBase !== null) {
            this.pendingPowerBase = null;
        }
        // Exiting any add/sub chain when starting mult/div
        this.pendingAddSubOp = null;
        this.addSubOperand = null;
        this.addSubResults = [];
        let val;
        const isResumedOperand = explicitVal === null && this.isNewSequence;
        if (explicitVal !== null) {
            val = explicitVal;
        } else {
            val = parseFloat(this.currentInput);
        }
        this.awaitingMultDivTotal = false;

        if (this.totalPendingState[1]) {
            this.totalPendingState[1] = false;
            this.accumulator = 0;
            this.lastAddSubValue = null;
        }

        // Nuova catena: reset elenco risultati
        if (!this.pendingMultDivOp) {
            this.multDivResults = [];
        }
        
        // --- CHAINING LOGIC ---
        // If there is already a pending operation (e.g. 10 x 5 x ...), 
        // we must execute the previous one first.
        // During replay (explicitVal provided) always chain — isNewSequence stays
        // true between replayed entries. @2026-02-08
        if (this.pendingMultDivOp && (!this.isNewSequence || explicitVal !== null)) {
             let interRes = 0;
             if (this.pendingMultDivOp === 'x') {
                 interRes = this.multDivOperand * val;
             } else if (this.pendingMultDivOp === '÷') {
                 if (val === 0 && !this.isReplaying) { this._triggerError("Error"); return; }
                 interRes = this.multDivOperand / val;
             }
             
             // Intermediate rounding? Usually yes on tape calcs
             interRes = this._applyRounding(interRes);

             this.multDivResults.push(interRes);
             
             // Let's adopt this: Update multDivOperand to the result.
             this.multDivOperand = interRes;
             if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(interRes));
             
             // Print the input value with the *previous* requested op? 
             // Or print just the input with the *new* op?
             // Standard:
             // 10 x
             // 5 x   (Meaning: 5 is factor, x is next op)
             // Result 50 is kept internal.
        } else {
             // First term in chain
             this.multDivOperand = val;
        }

        this.pendingMultDivOp = op;
        this._addHistoryEntry({
            val,
            symbol: op,
            key: op,
            type: 'input',
            isResumedOperand,
            sourceContext: 'multDiv'
        });
        
        this.currentInput = "0";
        this.isNewSequence = true;
    }

    _handlePercent() {
        if (this.pendingDelta !== null) this.pendingDelta = null;
        if (this.pendingPowerBase !== null) this.pendingPowerBase = null;

        const val = parseFloat(this.currentInput);
        if (isNaN(val)) return;

        // CASE 1: Mult/Div — A × B% = A * B/100 ; A ÷ B% = A / (B/100)
        if (this.pendingMultDivOp) {
            const base = this.multDivOperand;
            let res;

            if (this.pendingMultDivOp === 'x') {
                res = this._applyRounding(base * (val / 100));
            } else if (this.pendingMultDivOp === '÷') {
                if (val === 0 && !this.isReplaying) {
                    this._triggerError("Error");
                    return;
                }
                res = this._applyRounding(base / (val / 100));
            }

            // Tape: print input percentage
            this._addHistoryEntry({ val, symbol: '%', key: '%', type: 'input' });

            // Tape: print result
            const resRounded = this._applyRoundingWithFlag(res);
            res = resRounded.value;
            this._addHistoryEntry({
                val: this._formatResult(res),
                symbol: '',
                key: '=',
                type: 'result',
                roundingFlag: resRounded.roundingFlag,
                roundingRawValue: resRounded.rawValue
            });
            if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(res));

            this._accumulateGT(res);
            this.accumulator = parseFloat(Number(res).toPrecision(15));

            this.lastMultDivResult = res;
            this.awaitingMultDivTotal = true;
            this.multDivResults.push(res);
            this.multDivTotalPendingClear = false;

            this.currentInput = String(res);
            this.isNewSequence = true;
            this.pendingMultDivOp = null;
            this._emitStatus();
            return;
        }

        // CASE 2: Add/Sub — A + B% = A + A*B/100 ; A - B% = A - A*B/100
        // Resolves immediately (classic calculator behaviour) @2026-02-08
        if (this.pendingAddSubOp) {
            const base = this.addSubOperand;
            if (base === null || base === undefined || isNaN(base)) return;

            const percentAmount = this._applyRounding(base * (val / 100));
            const signedPercentValue = this.pendingAddSubOp === '-' ? -percentAmount : percentAmount;
            let res = this._applyRounding(base + signedPercentValue);

            // Tape: percentage input line with absolute value shown alongside
            this._addHistoryEntry({
                val: val,
                symbol: '%',
                key: '%',
                type: 'input',
                percentValue: signedPercentValue,
                percentBase: base,
                percentOp: this.pendingAddSubOp
            });

            // Tape: result total
            const resRounded = this._applyRoundingWithFlag(res);
            res = resRounded.value;
            this._addHistoryEntry({
                val: this._formatResult(res),
                symbol: '*',
                key: '%',
                type: 'result',
                roundingFlag: resRounded.roundingFlag,
                roundingRawValue: resRounded.rawValue
            });

            if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(res));

            this._accumulateGT(res);
            this.accumulator = parseFloat(Number(res).toPrecision(15));

            // Clean up add/sub chain state
            this.pendingAddSubOp = null;
            this.addSubOperand = null;
            this.addSubResults = [];
            this.lastAddSubValue = null;
            this.lastAddSubOp = null;

            this.currentInput = String(res);
            this.isNewSequence = true;
            this._emitStatus();
            return;
        }

        // CASE 3: Standalone % — no pending operation (no-op on classic calculators)
    }

    _handleDelta(explicitVal = null, stage = null) {
        const val = explicitVal !== null
            ? explicitVal
            : (stage === 'second' ? parseFloat(this.currentInput) : this._resolveUnaryBaseValue());
        if (val === null || isNaN(val)) return;

        const hasPending = this.pendingDelta !== null && typeof this.pendingDelta !== 'undefined';

        if (!hasPending || stage === 'first') {
            this.pendingMultDivOp = null;
            this.multDivOperand = null;
            this.awaitingMultDivTotal = false;
            this.lastMultDivResult = null;
            this.multDivResults = [];
            this.multDivTotalPendingClear = false;
            this.pendingDelta = val;
            this._addHistoryEntry({ val, symbol: 'Δ', key: 'Δ', type: 'input' });
            this.currentInput = "0";
            this.isNewSequence = true;
            return;
        }

        const base = this.pendingDelta;     // first entered value (old/reference)
        const nuovoValore = val;              // second entered value (new)
        if (base === 0) {
            if (!this.isReplaying) this._triggerError("Error");
            return;
        }

        const diff = nuovoValore - base;
        const percentRounded = this._applyRoundingWithFlag((diff / base) * 100);
        const diffRounded = this._applyRoundingWithFlag(diff);

        this._addHistoryEntry({ val: nuovoValore, symbol: '=', key: 'Δ2', type: 'input' });
        this._addHistoryEntry({
            val: this._formatResult(percentRounded.value),
            symbol: '%',
            key: 'Δ%',
            type: 'result',
            roundingFlag: percentRounded.roundingFlag,
            roundingRawValue: percentRounded.rawValue
        });
        this._addHistoryEntry({
            val: this._formatResult(diffRounded.value),
            symbol: 'T',
            key: 'ΔT',
            type: 'result',
            roundingFlag: diffRounded.roundingFlag,
            roundingRawValue: diffRounded.rawValue
        });

        this._accumulateGT(diffRounded.value);

        if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(diffRounded.value));

        this.accumulator = parseFloat(Number(diffRounded.value).toPrecision(15));
        this.currentInput = String(diffRounded.value);
        this.isNewSequence = true;
        this.pendingDelta = null;
        this._emitStatus();
    }

    _handleSqrt(explicitVal = null) {
        const val = explicitVal !== null ? explicitVal : this._resolveUnaryBaseValue();
        if (val === null || isNaN(val)) return;
        this.pendingMultDivOp = null;
        this.multDivOperand = null;
        this.awaitingMultDivTotal = false;
        this.lastMultDivResult = null;
        this.multDivResults = [];
        this.multDivTotalPendingClear = false;
        if (val < 0) {
            if (!this.isReplaying) this._triggerError("Error");
            return;
        }
        const resRounded = this._applyRoundingWithFlag(Math.sqrt(val));
        const res = resRounded.value;
        this._addHistoryEntry({ val, symbol: '√', key: '√', type: 'input' });
        this._addHistoryEntry({
            val: this._formatResult(res),
            symbol: '',
            key: '=',
            type: 'result',
            roundingFlag: resRounded.roundingFlag,
            roundingRawValue: resRounded.rawValue
        });
        if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(res));

        this._accumulateGT(res);
        this.currentInput = String(res);
        this.isNewSequence = true;
        this.pendingPowerBase = null;
        this.pendingDelta = null;
        this._emitStatus();
    }

    _handlePower(explicitVal = null, stage = null) {
        const val = explicitVal !== null
            ? explicitVal
            : (stage === 'second' ? parseFloat(this.currentInput) : this._resolveUnaryBaseValue());
        if (val === null || isNaN(val)) return;

        const hasPending = this.pendingPowerBase !== null && typeof this.pendingPowerBase !== 'undefined';

        if (!hasPending || stage === 'first') {
            this.pendingMultDivOp = null;
            this.multDivOperand = null;
            this.awaitingMultDivTotal = false;
            this.lastMultDivResult = null;
            this.multDivResults = [];
            this.multDivTotalPendingClear = false;
            this.pendingPowerBase = val;
            this._addHistoryEntry({ val, symbol: '^', key: '^', type: 'input' });
            this.currentInput = "0";
            this.isNewSequence = true;
            return;
        }

        const base = this.pendingPowerBase;
        const exp = val;
        const resRounded = this._applyRoundingWithFlag(Math.pow(base, exp));
        const res = resRounded.value;

        this._addHistoryEntry({ val: exp, symbol: '=', key: 'POW2', type: 'input' });
        this._addHistoryEntry({
            val: this._formatResult(res),
            symbol: '',
            key: '=',
            type: 'result',
            roundingFlag: resRounded.roundingFlag,
            roundingRawValue: resRounded.rawValue
        });
        if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(res));

        this._accumulateGT(res);

        this.currentInput = String(res);
        this.isNewSequence = true;
        this.pendingPowerBase = null;
        this.pendingDelta = null;
        this._emitStatus();
    }

    _handleEqual(explicitVal = null, resultKey = '=') {
        if (this.pendingDelta !== null) {
            this._handleDelta(explicitVal, 'second');
            return;
        }
        if (this.pendingPowerBase !== null) {
            this._handlePower(explicitVal, 'second');
            return;
        }

        if (this.gtPending) {
            this.gtPending = false;
            this._printGrandTotal(true, 'GT');
            this.resultRecallStage = 0;
            this.subtotalPendingFinalize = false;
            return;
        }

        if (this.subtotalPendingFinalize && this.pendingAddSubOp && this.isNewSequence) {
            const resRounded = this._applyRoundingWithFlag(this.addSubOperand ?? parseFloat(this.currentInput));
            const res = resRounded.value;

            this._addHistoryEntry({
                val: this._formatResult(res),
                symbol: '',
                key: '=',
                type: 'result',
                roundingFlag: resRounded.roundingFlag,
                roundingRawValue: resRounded.rawValue
            });

            if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(res));

            this._accumulateGT(res);
            this.accumulator = parseFloat(Number(res).toPrecision(15));
            this.currentInput = String(res);
            this.isNewSequence = true;
            this.pendingAddSubOp = null;
            this.lastAddSubValue = res;
            this.lastAddSubOp = null;
            this.lastOperation = null;
            this.subtotalPendingFinalize = false;
            this.resultRecallStage = 1;
            this._emitStatus();
            return;
        }

        if (this.pendingAddSubOp) {
            let val = explicitVal !== null ? explicitVal : parseFloat(this.currentInput);

            let res = 0;
            if (this.pendingAddSubOp === '+') {
                res = this.addSubOperand + val;
            } else if (this.pendingAddSubOp === '-') {
                res = this.addSubOperand - val;
            }

            this._addHistoryEntry({ val, symbol: '=', key: '=', type: 'input' });

            this.lastOperation = { op: this.pendingAddSubOp, operand: val };
            const resRounded = this._applyRoundingWithFlag(res);
            res = resRounded.value;

            this._addHistoryEntry({
                val: this._formatResult(res),
                symbol: '',
                key: '=',
                type: 'result',
                roundingFlag: resRounded.roundingFlag,
                roundingRawValue: resRounded.rawValue
            });
            if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(res));

            this._accumulateGT(res);
            this.accumulator = parseFloat(Number(res).toPrecision(15));

            this.lastAddSubValue = val;
            this.lastAddSubOp = this.pendingAddSubOp;
            this.lastMultDivResult = null;
            this.addSubResults.push(res);

            this.currentInput = String(res);
            this.isNewSequence = true;
            this.pendingAddSubOp = null;
            this.subtotalPendingFinalize = false;
            this.resultRecallStage = 1;
            this._emitStatus();
            return;
        }

        if (this.pendingMultDivOp) {
            let val = explicitVal !== null ? explicitVal : parseFloat(this.currentInput);
            const isResumedOperand = explicitVal === null && this.isNewSequence;

            this._addHistoryEntry({
                val,
                symbol: '=',
                key: '=',
                type: 'input',
                isResumedOperand,
                sourceContext: 'multDivEqual'
            });

            let res = 0;
            if (this.pendingMultDivOp === 'x') {
                res = this.multDivOperand * val;
            } else if (this.pendingMultDivOp === '÷') {
                if (val === 0 && !this.isReplaying) {
                    this._triggerError("Error");
                    return;
                }
                res = this.multDivOperand / val;
            }

            this.lastOperation = { op: this.pendingMultDivOp, operand: val };
            const resRounded = this._applyRoundingWithFlag(res);
            res = resRounded.value;

            this._addHistoryEntry({
                val: this._formatResult(res),
                symbol: '',
                key: '=',
                type: 'result',
                roundingFlag: resRounded.roundingFlag,
                roundingRawValue: resRounded.rawValue
            });
            if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(res));

            this._accumulateGT(res);
            this.accumulator += res;
            this.accumulator = parseFloat(Number(this.accumulator).toPrecision(15));

            this.lastMultDivResult = res;
            this.awaitingMultDivTotal = false;
            this.multDivResults.push(res);
            this.multDivTotalPendingClear = false;

            this.currentInput = String(res);
            this.isNewSequence = true;
            this.pendingMultDivOp = null;
            this.subtotalPendingFinalize = false;
            this.resultRecallStage = 1;
            this._emitStatus();
            return;
        }

        if (this.lastOperation) {
            if (this.isNewSequence) {
                this.lastOperation = null;
            } else {
                let val = explicitVal !== null ? explicitVal : parseFloat(this.currentInput);

                this._addHistoryEntry({ val, symbol: '', key: '=', type: 'input' });

                this._addHistoryEntry({
                    val: this.lastOperation.operand,
                    symbol: this.lastOperation.op,
                    key: 'CONST',
                    type: 'info'
                });

                let res = 0;
                if (this.lastOperation.op === 'x') {
                    res = val * this.lastOperation.operand;
                } else if (this.lastOperation.op === '÷') {
                    if (this.lastOperation.operand === 0 && !this.isReplaying) {
                        this._triggerError("Error");
                        return;
                    }
                    res = val / this.lastOperation.operand;
                } else if (this.lastOperation.op === '+') {
                    res = val + this.lastOperation.operand;
                } else if (this.lastOperation.op === '-') {
                    res = val - this.lastOperation.operand;
                }

                const resRounded = this._applyRoundingWithFlag(res);
                res = resRounded.value;

                this._addHistoryEntry({
                    val: this._formatResult(res),
                    symbol: '',
                    key: '=',
                    roundingFlag: resRounded.roundingFlag,
                    roundingRawValue: resRounded.rawValue
                });
                if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(res));

                if (this.lastOperation.op === '+' || this.lastOperation.op === '-') {
                    this.accumulator = parseFloat(Number(res).toPrecision(15));
                } else {
                    this.accumulator += res;
                    this.accumulator = parseFloat(Number(this.accumulator).toPrecision(15));
                }

                this._accumulateGT(res);

                this.currentInput = String(res);
                this.isNewSequence = true;
                this.subtotalPendingFinalize = false;
                this._emitStatus();

                this.resultRecallStage = 1;
                return;
            }
        }

        if (this.isNewSequence) {
            if (this.resultRecallStage === 1) {
                this._printGrandTotal(false, 'T1');
                this.resultRecallStage = 2;
                return;
            }
            if (this.resultRecallStage === 2) {
                this._printGrandTotal(true, 'GT');
                this.resultRecallStage = 0;
                return;
            }
            return;
        }

        this.resultRecallStage = 0;
        if (resultKey === 'T' || resultKey === 'T1') {
            this.isNewSequence = true;
        }
        this.subtotalPendingFinalize = false;
    }

    _printGrandTotal(clearAfter = false, symbol = 'T1') {
        let val = this.grandTotal;
        const gtRounded = this._applyRoundingWithFlag(val);
        val = gtRounded.value;

        this._addHistoryEntry({
            val: this._formatResult(val),
            symbol,
            key: 'GT',
            type: 'input',
            roundingFlag: gtRounded.roundingFlag,
            roundingRawValue: gtRounded.rawValue
        });

        if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(val));
        this.currentInput = String(val);
        this.isNewSequence = true;

        if (clearAfter) {
            this.grandTotal = 0;
        }

        this._emitStatus();
    }

    _toggleSign() {
        if (this.isNewSequence && this.currentInput === "0") return;
        const val = parseFloat(this.currentInput);
        if (isNaN(val) || val === 0) {
            this.currentInput = "0";
        } else {
            this.currentInput = String(-val);
        }
        this.isNewSequence = false;
        if (!this.isReplaying) this.onDisplayUpdate(this.currentInput);
    }

    _handleTotal(accIndex = 1) {
        // Chiusura catena mult/div: azzera stato catena
        this.awaitingMultDivTotal = false;
        this.lastMultDivResult = null;
        this.multDivResults = [];
        this.pendingMultDivOp = null;
        this.multDivTotalPendingClear = false;

        // GT Logic Override (If GT key was pressed before T)
        // Only trigger special GT behavior if ACC switch is active? 
        // User says: "se, e solo se lo switch ACC è su on la logica prevede un accumulatore speciale... quindi questo tasto va premuto prima..."
        // This implies the KEY works this way if SWITCH is ON. 
        // If Switch is OFF, maybe GT key does nothing?
        // Let's assume switch controls accumulation, but key logic is always available to read the register if something is there.
        if (this.gtPending && accIndex === 1) { 
            this.gtPending = false;
            // Print GT Total (GT*) e Clear
            let val = this.grandTotal;
            const gtRounded = this._applyRoundingWithFlag(val);
            val = gtRounded.value;
            
            // Format symbol usually GT* for Total
            this._addHistoryEntry({
                val: this._formatResult(val),
                symbol: 'GT',
                key: 'GT',
                type: 'input',
                roundingFlag: gtRounded.roundingFlag,
                roundingRawValue: gtRounded.rawValue
            }); 
            if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(val));
            
            // Clear GT
            this.grandTotal = 0;
            this.currentInput = String(val);
            this.isNewSequence = true;
            this._emitStatus();
            return;
        }

        // Acc 1
        let val = this.accumulator;
        const totalRounded = this._applyRoundingWithFlag(val);
        val = totalRounded.value;
        
        // Logic:
        // 1st press: Print Total (looks like Total), do NOT clear. Set Pending State.
        // 2nd press (or if Pending State is true): Print Total (Symbol *), Clear Accumulator, Add to GT.
        
        const isSecondPress = this.totalPendingState[accIndex];
        
        // Symbol: User interface usually distinguishes S (diamond) vs T (*). 
        // But requested logic is "First T prints result... only second T clears".
        // Let's use 'S' symbol for first press (Subtotal concept) and '*' for second (Total).
        const sym = (isSecondPress ? '*' : '◇');
        
        // Tag as input so it replays (clears accumulators correctly)
        this._addHistoryEntry({
            val: this._formatResult(val),
            symbol: sym,
            key: 'T' + accIndex,
            type: 'input',
            roundingFlag: totalRounded.roundingFlag,
            roundingRawValue: totalRounded.rawValue
        });
        if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(val));
        
        if (isSecondPress) {
            // Finalize: Clear & Add to GT
            // Do not accumulate here to avoid double add
            this.accumulator = 0;
            // Reset state
            this.totalPendingState[accIndex] = false;
        } else {
            // First press: Hold state
            this.totalPendingState[accIndex] = true;
            this._accumulateGT(val);
        }
        
        // "questo risultato ... sarà il primo operando"
        // We ensure currentInput holds the total value so it can be picked up by next op.
        this.currentInput = String(val);
        this.isNewSequence = true;
        this._emitStatus();
    }
    
    _handleSubTotal(accIndex = 1) {
        this.resultRecallStage = 0;
        this.awaitingMultDivTotal = false;
        this.lastMultDivResult = null;
        this.multDivResults = [];
        this.pendingMultDivOp = null;
        this.multDivTotalPendingClear = false;

        // GT Logic Override (If GT key was pressed before S)
        if (this.gtPending && accIndex === 1) {
             this.gtPending = false;
             // Print GT Subtotal (GT) - No Clear
             let val = this.grandTotal;
             const gtRounded = this._applyRoundingWithFlag(val);
             val = gtRounded.value;
             
             this._addHistoryEntry({
                 val: this._formatResult(val),
                 symbol: 'T1',
                 key: 'GT',
                 type: 'input',
                 roundingFlag: gtRounded.roundingFlag,
                 roundingRawValue: gtRounded.rawValue
             });
             if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(val));
             
             this.currentInput = String(val);
             this.isNewSequence = true;
             // Do NOT clear GT
             this._emitStatus();
             return;
        }

        let val = this.accumulator;

        if (this.pendingAddSubOp && this.addSubOperand !== null && this.addSubOperand !== undefined) {
            val = this.addSubOperand;

            if (!this.isNewSequence) {
                const tailOperand = parseFloat(this.currentInput);
                if (!isNaN(tailOperand)) {
                    if (this.pendingAddSubOp === '+') {
                        val = this.addSubOperand + tailOperand;
                    } else if (this.pendingAddSubOp === '-') {
                        val = this.addSubOperand - tailOperand;
                    }
                    val = this._applyRounding(val);
                }
            }

            // Commit subtotal as new chain base while keeping +/- chain alive.
            // This mirrors calculator behavior where S does not break the chain.
            // @2026-03-22
            this.addSubOperand = val;
            this.addSubResults = [];
            this.lastAddSubValue = val;
            this.lastAddSubOp = this.pendingAddSubOp;
            this.lastOperation = null;
            this.subtotalPendingFinalize = true;

            // Keep accumulator aligned with visible subtotal for T/S continuity.
            this.accumulator = parseFloat(Number(val).toPrecision(15));
        }

        const subtotalRounded = this._applyRoundingWithFlag(val);
        val = subtotalRounded.value;
        
        const sym = 'S';
        
        this._addHistoryEntry({
            val: this._formatResult(val),
            symbol: sym,
            key: 'S' + accIndex,
            type: 'input',
            roundingFlag: subtotalRounded.roundingFlag,
            roundingRawValue: subtotalRounded.rawValue
        });
        if (!this.isReplaying) this.onDisplayUpdate(this._formatResult(val));
        
        // Do NOT clear accumulator
        this.currentInput = String(val);
        this.isNewSequence = true;
    }
    
    _handleGrandTotal() {
        // Toggle GT Pending State
        this.resultRecallStage = 0;
        this.gtPending = !this.gtPending;
    }

    _handleBackspace() {
          // If we are editing a number, standard backspace
          if (!this.isNewSequence && this.currentInput !== "0") {
             if (this.currentInput.length > 1) {
                this.currentInput = this.currentInput.slice(0, -1);
             } else {
                this.currentInput = "0";
             }
             if (!this.isReplaying) this.onDisplayUpdate(this.currentInput);
             return;
        }

        // Undo the last committed operation in the chain
        this.undo();
    }

    // --- CLEAR / EDIT ---
    // --- STATE SNAPSHOT ---
    /**
     * Get a snapshot of current calculator state for history/restore
     */
    getStateSnapshot() {
        return {
            entries: this._snapshotEntries(this.entries),
            currentInput: this.currentInput,
            accumulator: this.accumulator,
            grandTotal: this.grandTotal,
            pendingMultDivOp: this.pendingMultDivOp,
            multDivOperand: this.multDivOperand,
            isNewSequence: this.isNewSequence,
            errorState: this.errorState,
            totalPendingState: { ...this.totalPendingState },
            lastOperation: this.lastOperation ? { ...this.lastOperation } : null,
            lastAddSubValue: this.lastAddSubValue,
            lastAddSubOp: this.lastAddSubOp,
            pendingAddSubOp: this.pendingAddSubOp,
            addSubOperand: this.addSubOperand,
            addSubResults: [...this.addSubResults],
            lastMultDivResult: this.lastMultDivResult,
            awaitingMultDivTotal: this.awaitingMultDivTotal,
            multDivResults: [...this.multDivResults],
            multDivTotalPendingClear: this.multDivTotalPendingClear,
            memoryRegister: this.memoryRegister,
            memoryStack: [...this.memoryStack],
            taxRate: this.taxRate,
            marginPercent: this.marginPercent,
            markupPercent: this.markupPercent,
            costValue: this.costValue,
            sellValue: this.sellValue,
            pricingMode: this.pricingMode,
            gtPending: this.gtPending,
            resultRecallStage: this.resultRecallStage,
            subtotalPendingFinalize: this.subtotalPendingFinalize,
            pendingDelta: this.pendingDelta,
            pendingPowerBase: this.pendingPowerBase,
            expressionTokens: [...this.expressionTokens],
            expressionOpenCount: this.expressionOpenCount,
            isExpressionMode: this.isExpressionMode
        };
    }

    /**
     * Restore calculator state from a snapshot
     */
    restoreStateSnapshot(snapshot) {
        if (!snapshot) return;
        this.entries = this._snapshotEntries(snapshot.entries || []);
        this.currentInput = snapshot.currentInput ?? "0";
        this.accumulator = snapshot.accumulator ?? 0;
        this.grandTotal = snapshot.grandTotal ?? 0;
        this.pendingMultDivOp = snapshot.pendingMultDivOp ?? null;
        this.multDivOperand = snapshot.multDivOperand ?? null;
        this.isNewSequence = snapshot.isNewSequence ?? true;
        this.errorState = snapshot.errorState ?? false;
        this.totalPendingState = { ...(snapshot.totalPendingState || { 1: false }) };
        this.lastOperation = snapshot.lastOperation ? { ...snapshot.lastOperation } : null;
        this.lastAddSubValue = snapshot.lastAddSubValue ?? null;
        this.lastAddSubOp = snapshot.lastAddSubOp ?? null;
        this.pendingAddSubOp = snapshot.pendingAddSubOp ?? null;
        this.addSubOperand = snapshot.addSubOperand ?? null;
        this.addSubResults = [...(snapshot.addSubResults || [])];
        this.lastMultDivResult = snapshot.lastMultDivResult ?? null;
        this.awaitingMultDivTotal = snapshot.awaitingMultDivTotal ?? false;
        this.multDivResults = [...(snapshot.multDivResults || [])];
        this.multDivTotalPendingClear = snapshot.multDivTotalPendingClear ?? false;
        this.memoryRegister = snapshot.memoryRegister ?? 0;
        this.memoryStack = [...(snapshot.memoryStack || [])];
        this.taxRate = snapshot.taxRate ?? 22;
        this.marginPercent = snapshot.marginPercent ?? 0;
        this.markupPercent = snapshot.markupPercent ?? 0;
        this.costValue = snapshot.costValue ?? null;
        this.sellValue = snapshot.sellValue ?? null;
        this.pricingMode = snapshot.pricingMode ?? 'margin';
        this.gtPending = snapshot.gtPending ?? false;
        this.resultRecallStage = snapshot.resultRecallStage ?? 0;
        this.subtotalPendingFinalize = snapshot.subtotalPendingFinalize ?? false;
        this.pendingDelta = snapshot.pendingDelta ?? null;
        this.pendingPowerBase = snapshot.pendingPowerBase ?? null;
        this.expressionTokens = [...(snapshot.expressionTokens || [])];
        this.expressionOpenCount = snapshot.expressionOpenCount ?? 0;
        this.isExpressionMode = snapshot.isExpressionMode ?? false;
        
        // Refresh UI
        this.onDisplayUpdate(this._formatResult(this.currentInput));
        if (this.onTapeRefresh) this.onTapeRefresh(this.entries);
        this._emitStatus();
        this._emitMemoryUpdate();
    }

    // --- CLEAR ---
    _clearAll() {
        // Save state before clearing
        const snapshot = this.getStateSnapshot();
        if (this.onBeforeClearAll) {
            this.onBeforeClearAll(snapshot);
        }

        this.accumulator = 0;
        this.grandTotal = 0;
        this.currentInput = "0";
        this.pendingMultDivOp = null;
        this.errorState = false;
        this.lastAddSubValue = null;
        this.lastAddSubOp = null;
        this.pendingAddSubOp = null;
        this.addSubOperand = null;
        this.addSubResults = [];
        this.lastMultDivResult = null;
        this.awaitingMultDivTotal = false;
        this.multDivResults = [];
        this.multDivTotalPendingClear = false;
        this.pendingDelta = null;
        this.pendingPowerBase = null;
        this.awaitingRate = false;
        this.costValue = null;
        this.sellValue = null;
        this.markupPercent = 0;
        this.pricingMode = 'margin';
        this.lastOperation = null;
        this.gtPending = false;
        this.resultRecallStage = 0;
        this.subtotalPendingFinalize = false;
        this.addModeBuffer = "";
        this._resetExpressionState();
        
        this.entries = []; // Clear history
        
        // Notify UI
        this.onDisplayUpdate("0");
        if (this.onTapeRefresh) this.onTapeRefresh([]);
        this.onTapePrint({ val: 0, symbol: "C", key: "C", type: "input" });
        this._emitStatus();
    }

    _clearEntry() {
        this.currentInput = "0";
        this.pendingDelta = null;
        this.pendingPowerBase = null;
        this.addModeBuffer = "";
        this.onDisplayUpdate("0");
    }

    // --- BUSINESS KEYS ---
    _handleBusinessKey(key) {
        if (key === 'RATE') {
            this.awaitingRate = true;
            this.currentInput = String(this.taxRate);
            this.isNewSequence = true;
            this.onDisplayUpdate(this.currentInput);
            return;
        }

        // For other keys, we need a numeric input
        let val = parseFloat(this.currentInput);
        if (isNaN(val) || (this.isNewSequence && this.currentInput === "0")) {
            const resolved = this._resolveUnaryBaseValue();
            if (resolved !== null && !isNaN(resolved)) {
                val = resolved;
            }
        }
        if (isNaN(val)) {
            this._triggerError("Error");
            return;
        }

            // Business keys operate on a positive input when used as unary on the
            // waiting-first-operand state. Accept the absolute value to match
            // expected behaviour (user indicated "purché positivo").
            if (val < 0 && ['COST','SELL','MARGIN','MARKUP','TAX+','TAX-'].includes(key)) {
                val = Math.abs(val);
            }

        try {
            let res;
            if (key === 'MARGIN') {
                // If cost and sell are present, compute margin
                if (this.isNewSequence && this.currentInput === "0" && this.costValue !== null && this.sellValue !== null) {
                    // Print under-the-hood steps:
                    // sell -
                    // cost =
                    // profit ÷
                    // sell =
                    // margin%
                    // @2026-03-07
                    const profitRounded = this._applyRoundingWithFlag(this.sellValue - this.costValue);
                    const profit = profitRounded.value;

                    this._addHistoryEntry({ val: this.sellValue, symbol: '-', key: 'MARGIN', type: 'input' });
                    this._addHistoryEntry({ val: this.costValue, symbol: '=', key: 'MARGIN', type: 'input' });
                    this._addHistoryEntry({
                        val: this._formatResult(profit),
                        symbol: '÷',
                        key: 'MARGIN',
                        type: 'result',
                        roundingFlag: profitRounded.roundingFlag,
                        roundingRawValue: profitRounded.rawValue
                    });

                    this._addHistoryEntry({ val: this.sellValue, symbol: '=', key: 'MARGIN', type: 'input' });

                    const marginRounded = this._applyRoundingWithFlag((profit / this.sellValue) * 100);
                    res = marginRounded.value;
                    this.marginPercent = res;
                    this.pricingMode = 'margin';
                    this._addHistoryEntry({
                        val: this._formatResult(res),
                        symbol: '',
                        key: 'MARGIN',
                        type: 'result',
                        percentSuffix: true,
                        roundingFlag: marginRounded.roundingFlag,
                        roundingRawValue: marginRounded.rawValue
                    });

                    this.onDisplayUpdate(String(res));
                    this.currentInput = String(res);
                    this.isNewSequence = true;
                    return;
                }

                // Store margin
                this.marginPercent = val;
                this.pricingMode = 'margin';
                this._addHistoryEntry({ val, symbol: 'MARGIN', key: 'MARGIN', type: 'input', percentSuffix: true });
                this.onDisplayUpdate(String(val));
                this.currentInput = "0";
                this.isNewSequence = true;
                return;
            }

            if (key === 'MARKUP') {
                // If cost and sell are present, compute markup
                if (this.isNewSequence && this.currentInput === "0" && this.costValue !== null && this.sellValue !== null) {
                    // Print under-the-hood steps:
                    // sell -
                    // cost =
                    // profit ÷
                    // cost =
                    // markup%
                    // @2026-03-07
                    const profitRounded = this._applyRoundingWithFlag(this.sellValue - this.costValue);
                    const profit = profitRounded.value;

                    this._addHistoryEntry({ val: this.sellValue, symbol: '-', key: 'MARKUP', type: 'input' });
                    this._addHistoryEntry({ val: this.costValue, symbol: '=', key: 'MARKUP', type: 'input' });
                    this._addHistoryEntry({
                        val: this._formatResult(profit),
                        symbol: '÷',
                        key: 'MARKUP',
                        type: 'result',
                        roundingFlag: profitRounded.roundingFlag,
                        roundingRawValue: profitRounded.rawValue
                    });

                    this._addHistoryEntry({ val: this.costValue, symbol: '=', key: 'MARKUP', type: 'input' });

                    const markupRounded = this._applyRoundingWithFlag((profit / this.costValue) * 100);
                    res = markupRounded.value;
                    this.markupPercent = res;
                    this.pricingMode = 'markup';
                    this._addHistoryEntry({
                        val: this._formatResult(res),
                        symbol: '',
                        key: 'MARKUP',
                        type: 'result',
                        percentSuffix: true,
                        roundingFlag: markupRounded.roundingFlag,
                        roundingRawValue: markupRounded.rawValue
                    });

                    this.onDisplayUpdate(String(res));
                    this.currentInput = String(res);
                    this.isNewSequence = true;
                    return;
                }

                // Store markup
                this.markupPercent = val;
                this.pricingMode = 'markup';
                this._addHistoryEntry({ val, symbol: 'MARKUP', key: 'MARKUP', type: 'input', percentSuffix: true });
                this.onDisplayUpdate(String(val));
                this.currentInput = "0";
                this.isNewSequence = true;
                return;
            }

            // Calculations
            // TAX+/TAX-: if input is zero, do nothing
            // @2026-03-07
            if ((key === 'TAX+' || key === 'TAX-') && val === 0) {
                return;
            }

            if (key === 'TAX+') {
                // TAX+ behaves like A + A*(taxRate/100), print as percentage operation
                // @2026-03-07
                const taxAmount = this._applyRounding(val * (this.taxRate / 100));
                res = this._applyRounding(val + taxAmount);
                
                // Entry 0: Base operand with + operator
                this._addHistoryEntry({
                    val: val,
                    symbol: '+',
                    key: 'TAX+',
                    type: 'input'
                });
                
                // Entry 1: Tax rate input with calculated value
                this._addHistoryEntry({
                    val: this.taxRate,
                    symbol: '%',
                    key: 'TAX+',
                    type: 'input',
                    percentValue: taxAmount,
                    percentBase: val,
                    percentOp: '+'
                });
                
                // Entry 2: Result with total
                const resRounded = this._applyRoundingWithFlag(res);
                res = resRounded.value;
                this._addHistoryEntry({
                    val: this._formatResult(res),
                    symbol: '*',
                    key: 'TAX+',
                    type: 'result',
                    roundingFlag: resRounded.roundingFlag,
                    roundingRawValue: resRounded.rawValue
                });
                
                this.onDisplayUpdate(String(res));
                this.currentInput = String(res);
                this.isNewSequence = true;
                return;
            }
            else if (key === 'TAX-') {
                // TAX- scorporates tax: A / (1 + taxRate/100)
                // Example: 122 with 22% tax -> 122 / 1.22 = 100
                // @2026-03-07
                const divisor = 1 + (this.taxRate / 100);
                res = this._applyRounding(val / divisor);
                const taxAmount = this._applyRounding(val - res);
                
                // Entry 0: Base operand with ÷ operator
                this._addHistoryEntry({
                    val: val,
                    symbol: '÷',
                    key: 'TAX-',
                    type: 'input'
                });
                
                // Entry 1: Tax rate input with calculated value
                this._addHistoryEntry({
                    val: this.taxRate,
                    symbol: '%',
                    key: 'TAX-',
                    type: 'input',
                    percentValue: -taxAmount,
                    percentBase: val,
                    percentOp: '-'
                });
                
                // Entry 2: Result with total
                const resRounded = this._applyRoundingWithFlag(res);
                res = resRounded.value;
                this._addHistoryEntry({
                    val: this._formatResult(res),
                    symbol: '*',
                    key: 'TAX-',
                    type: 'result',
                    roundingFlag: resRounded.roundingFlag,
                    roundingRawValue: resRounded.rawValue
                });
                
                this.onDisplayUpdate(String(res));
                this.currentInput = String(res);
                this.isNewSequence = true;
                return;
            }
            else if (key === 'COST') {
                if (this.isNewSequence && this.currentInput === "0" && this.sellValue !== null) {
                    // Calculate COST from SELL and MARGIN/MARKUP
                    // Print under-the-hood steps
                    // @2026-03-07
                    if (this.pricingMode === 'markup') {
                        // COST = SELL / (1 + MARKUP/100)
                        // Similar to TAX- scorporation
                        const divisor = 1 + (this.markupPercent / 100);
                        res = this._applyRounding(this.sellValue / divisor);
                        const markupAmount = this._applyRounding(this.sellValue - res);
                        
                        this._addHistoryEntry({ val: this.sellValue, symbol: '÷', key: 'COST', type: 'input' });
                        this._addHistoryEntry({
                            val: this.markupPercent,
                            symbol: '%',
                            key: 'COST',
                            type: 'input',
                            percentValue: -markupAmount,
                            percentBase: this.sellValue,
                            percentOp: '-'
                        });
                    } else {
                        // COST = SELL * (1 - MARGIN/100)
                        const multiplier = 1 - (this.marginPercent / 100);
                        res = this._applyRounding(this.sellValue * multiplier);
                        const marginAmount = this._applyRounding(this.sellValue - res);
                        
                        this._addHistoryEntry({ val: this.sellValue, symbol: 'x', key: 'COST', type: 'input' });
                        this._addHistoryEntry({
                            val: this.marginPercent,
                            symbol: '%',
                            key: 'COST',
                            type: 'input',
                            percentValue: -marginAmount,
                            percentBase: this.sellValue,
                            percentOp: '-'
                        });
                    }
                    
                    const resRounded = this._applyRoundingWithFlag(res);
                    res = resRounded.value;
                    this._addHistoryEntry({
                        val: this._formatResult(res),
                        symbol: '',
                        key: 'COST',
                        type: 'result',
                        roundingFlag: resRounded.roundingFlag,
                        roundingRawValue: resRounded.rawValue
                    });
                    
                    this.costValue = res;
                    this.onDisplayUpdate(String(res));
                    this.currentInput = String(res);
                    this.isNewSequence = true;
                    return;
                } else {
                    this.costValue = val;
                    this._addHistoryEntry({ val, symbol: 'COST', key: 'COST', type: 'input' });
                    this.onDisplayUpdate(String(val));
                    this.currentInput = "0";
                    this.isNewSequence = true;
                    return;
                }
            }
            else if (key === 'SELL') {
                if (this.isNewSequence && this.currentInput === "0" && this.costValue !== null) {
                    // Calculate SELL from COST and MARGIN/MARKUP
                    // Print under-the-hood steps
                    // @2026-03-07
                    if (this.pricingMode === 'markup') {
                        // SELL = COST * (1 + MARKUP/100)
                        // Similar to TAX+ addition
                        const markupAmount = this._applyRounding(this.costValue * (this.markupPercent / 100));
                        res = this._applyRounding(this.costValue + markupAmount);
                        
                        this._addHistoryEntry({ val: this.costValue, symbol: '+', key: 'SELL', type: 'input' });
                        this._addHistoryEntry({
                            val: this.markupPercent,
                            symbol: '%',
                            key: 'SELL',
                            type: 'input',
                            percentValue: markupAmount,
                            percentBase: this.costValue,
                            percentOp: '+'
                        });
                    } else {
                        // SELL = COST / (1 - MARGIN/100)
                        const divisor = 1 - (this.marginPercent / 100);
                        if (divisor === 0) {
                            this._triggerError("Error");
                            return;
                        }
                        res = this._applyRounding(this.costValue / divisor);
                        const marginAmount = this._applyRounding(res - this.costValue);
                        
                        this._addHistoryEntry({ val: this.costValue, symbol: '÷', key: 'SELL', type: 'input' });
                        this._addHistoryEntry({
                            val: this.marginPercent,
                            symbol: '%',
                            key: 'SELL',
                            type: 'input',
                            percentValue: marginAmount,
                            percentBase: res,
                            percentOp: '+'
                        });
                    }
                    
                    const resRounded = this._applyRoundingWithFlag(res);
                    res = resRounded.value;
                    this._addHistoryEntry({
                        val: this._formatResult(res),
                        symbol: '',
                        key: 'SELL',
                        type: 'result',
                        roundingFlag: resRounded.roundingFlag,
                        roundingRawValue: resRounded.rawValue
                    });
                    
                    this.sellValue = res;
                    this.onDisplayUpdate(String(res));
                    this.currentInput = String(res);
                    this.isNewSequence = true;
                    return;
                } else {
                    this.sellValue = val;
                    this._addHistoryEntry({ val, symbol: 'SELL', key: 'SELL', type: 'input' });
                    this.onDisplayUpdate(String(val));
                    this.currentInput = "0";
                    this.isNewSequence = true;
                    return;
                }
            }

        } catch (e) {
            this._triggerError("Error"); // DivisionByZero etc
        }
    }

    // --- FORMATTING / MATH ---
    _applyRounding(val) {
        // First fix tiny floating point errors (e.g. 2.2+2.2+2.2 = 6.6000000000000005)
        val = parseFloat(Number(val).toPrecision(15));
        
        if (this.settings.isFloat) return val;
        return applyRounding(val, this.settings.roundingMode, this.settings.decimals);
    }

    _applyRoundingWithFlag(val) {
        const raw = parseFloat(Number(val).toPrecision(15));
        if (this.settings.isFloat) {
            return { value: raw, roundingFlag: null, rawValue: raw };
        }
        const rounded = applyRounding(raw, this.settings.roundingMode, this.settings.decimals);
        let roundingFlag = null;
        if (rounded > raw) roundingFlag = 'up';
        else if (rounded < raw) roundingFlag = 'down';
        return { value: rounded, roundingFlag, rawValue: raw };
    }

    _formatResult(val) {
        if (this.settings.isFloat) return String(val);
        // Force fixed decimals string representation
        return Number(val).toFixed(this.settings.decimals);
    }

    // --- HISTORY / TAPE ---
    _addHistoryEntry(entry) {
        // Enforce validations
        if (entry.val === undefined || entry.val === null) return;
        if (typeof entry.val === 'number' && isNaN(entry.val)) return;
        if (typeof entry.val === 'string' && entry.val.trim() === '') return;
        
        // Enrich entry
        if (!entry.timestamp) entry.timestamp = Date.now();
        this.entries.push(entry);
        
        if (!this.isReplaying) {
            this.onTapePrint(entry);
        }
    }
    
    // --- ERROR ---
    _triggerError(msg) {
        this.errorState = true;
        this.onError(msg);
        this.onDisplayUpdate(msg);
    }
}

export { CalculatorEngine };
