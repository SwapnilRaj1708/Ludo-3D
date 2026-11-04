import { describe, expect, it } from 'vitest';
import { classifyJoinError } from '../src/services/online/gameServer';

describe('classifyJoinError', () => {
  it('maps server and network errors to the messages players see', () => {
    expect(classifyJoinError(new Error('room "ABCDEF" not found'))).toBe('not-found');
    expect(classifyJoinError(new Error('room is full'))).toBe('full');
    expect(classifyJoinError(new Error('match already started'))).toBe('full');
    expect(classifyJoinError(new Error('too many matchmaking requests'))).toBe('rate-limited');
    expect(classifyJoinError(new TypeError('Failed to fetch'))).toBe('unavailable');
    expect(classifyJoinError(new Error('something unexpected'))).toBe('unknown');
  });
});
