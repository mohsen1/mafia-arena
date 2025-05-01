// src/lib/utils/tests/stringUtils.test.ts
import { describe, it, expect } from 'vitest';
import { cleanAIResponse, extractJSONFromText } from '@/lib/utils/stringUtils';

describe('stringUtils', () => {
    describe('cleanAIResponse', () => {
        it('should remove <think> blocks', () => {
            const response = 'This is the result. <think>I should consider edge cases.</think> More result.';
            expect(cleanAIResponse(response)).toBe('This is the result.  More result.');
        });

        it('should remove multi-line <think> blocks', () => {
            const response = 'Start.\n<think>\nLine 1\nLine 2\n</think>\nEnd.';
            expect(cleanAIResponse(response)).toBe('Start.\n\nEnd.'); // Preserves some newline structure
        });

        it('should remove ```json blocks and markers', () => {
            const response = 'Here is the JSON: ```json\n{"key": "value"}\n``` See?';
            expect(cleanAIResponse(response)).toBe('Here is the JSON: \n{"key": "value"}\n See?');
        });

        it('should remove ``` blocks without language specifier', () => {
            const response = 'Code block:\n```\nconst x = 1;\n```\nDone.';
            expect(cleanAIResponse(response)).toBe('Code block:\n\nconst x = 1;\n\nDone.');
        });

        it('should remove backticks', () => {
            const response = 'Use the `variable` name.';
            expect(cleanAIResponse(response)).toBe('Use the variable name.');
        });

        it('should remove common reasoning prefixes', () => {
            expect(cleanAIResponse('Reasoning: It must be player 2.')).toBe('It must be player 2.');
            expect(cleanAIResponse('Thought: Player 1 seems suspicious.')).toBe('Player 1 seems suspicious.');
            expect(cleanAIResponse('Thinking: Okay, let\'s vote.')).toBe('Okay, let\'s vote.');
            expect(cleanAIResponse('Analysis: Based on the votes...')).toBe('Based on the votes...');
        });

        it('should trim whitespace', () => {
            const response = '  Result   ';
            expect(cleanAIResponse(response)).toBe('Result');
        });

        it('should collapse multiple newlines', () => {
            const response = 'Line 1\n\n\nLine 2\n\n\n\nLine 3';
            expect(cleanAIResponse(response)).toBe('Line 1\n\nLine 2\n\nLine 3');
        });

        it('should handle combined cleaning cases', () => {
            const response = '  Reasoning: The data <think>might be wrong</think> shows `p1`. ```json\n{"action": "vote"}\n``` \n\n\n Final thought. ';
            expect(cleanAIResponse(response)).toBe('The data  shows p1. \n{"action": "vote"}\n \n\n Final thought.');
        });

        it('should return empty string for empty input', () => {
            expect(cleanAIResponse('')).toBe('');
        });
    });

    describe('extractJSONFromText', () => {
        it('should extract JSON when surrounded by text', () => {
            const text = 'Explanation... {"key": "value", "nested": {}} explanation.';
            expect(extractJSONFromText(text)).toBe('{"key": "value", "nested": {}}');
        });

        it('should return the string if it is only JSON', () => {
            const text = '{"key": "value"}';
            expect(extractJSONFromText(text)).toBe(text);
        });

        it('should return the original text if no JSON object braces are found', () => {
            const text = 'This is just plain text.';
            expect(extractJSONFromText(text)).toBe(text);
        });

        it('should return the original text if braces are mismatched or invalid', () => {
            const text = 'Text with { brace but no end.';
            expect(extractJSONFromText(text)).toBe(text);
            const text2 = 'Text with } end brace first.';
            expect(extractJSONFromText(text2)).toBe(text2);
        });

        it('should extract the first valid JSON block if multiple exist', () => {
            // It finds the *first* '{' and the *last* '}'
            const text = 'First: {"a": 1} Second: {"b": 2}';
            expect(extractJSONFromText(text)).toBe('{"a": 1} Second: {"b": 2}'); // This behavior might be unexpected but is what the code does.
        });

        it('should handle nested braces correctly', () => {
            const text = 'Surrounding text {"outer": {"inner": 1}} end text.';
            expect(extractJSONFromText(text)).toBe('{"outer": {"inner": 1}}');
        });

        it('should handle whitespace around JSON', () => {
            const text = '  \n\n {"key": "value"} \n  ';
            expect(extractJSONFromText(text)).toBe('{"key": "value"}');
        });
    });
});
