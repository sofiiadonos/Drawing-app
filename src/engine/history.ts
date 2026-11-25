/**
 * @file history.ts
 * Undo/Redo history stack manager using the Command pattern.
 * Supports add, delete, and live property modifications with state rollback.
 */

import { HistoryAction } from '../types';

export class HistoryManager {
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];
  private maxHistory: number = 60;
  private onChangeCallbacks: Set<() => void> = new Set();

  constructor(maxHistory = 60) {
    this.maxHistory = maxHistory;
  }

  public subscribe(cb: () => void): () => void {
    this.onChangeCallbacks.add(cb);
    return () => this.onChangeCallbacks.delete(cb);
  }

  private notify() {
    this.onChangeCallbacks.forEach((cb) => cb());
  }

  public push(action: HistoryAction) {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // Clear redo on new action
    this.redoStack = [];
    this.notify();
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public popUndo(): HistoryAction | null {
    const action = this.undoStack.pop();
    if (action) {
      this.redoStack.push(action);
      this.notify();
      return action;
    }
    return null;
  }

  public popRedo(): HistoryAction | null {
    const action = this.redoStack.pop();
    if (action) {
      this.undoStack.push(action);
      this.notify();
      return action;
    }
    return null;
  }

  public clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}
