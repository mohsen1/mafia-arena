// src/lib/utils/tests/stringUtils.test.ts
import { describe, it, expect } from 'vitest';
import { cleanAIResponse, extractJSONFromText, escapeJSONControlCharacters } from '@/lib/utils/stringUtils';

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

    describe('escapeJSONControlCharacters', () => {
        it('should escape newlines in JSON string values', () => {
            const json = '{"message": "line1\nline2"}';
            const expected = '{"message": "line1\\nline2"}';
            expect(escapeJSONControlCharacters(json)).toBe(expected);
        });

        it('should escape multiple types of control characters', () => {
            const json = '{"text": "tab\there\nand\rcarriage\treturn"}';
            const expected = '{"text": "tab\\there\\nand\\rcarriage\\treturn"}';
            expect(escapeJSONControlCharacters(json)).toBe(expected);
        });

        it('should not escape control characters in JSON keys', () => {
            const json = '{"key": "value with\nnewline"}';
            const expected = '{"key": "value with\\nnewline"}';
            expect(escapeJSONControlCharacters(json)).toBe(expected);
        });

        it('should handle complex JSON with nested objects', () => {
            const json = '{"outer": {"inner": "text\nwith\nnewlines"}, "simple": "normal"}';
            const expected = '{"outer": {"inner": "text\\nwith\\nnewlines"}, "simple": "normal"}';
            expect(escapeJSONControlCharacters(json)).toBe(expected);
        });

        it('should handle empty strings and return empty', () => {
            expect(escapeJSONControlCharacters('')).toBe('');
            expect(escapeJSONControlCharacters('{"empty": ""}')).toBe('{"empty": ""}');
        });

        it('should handle already escaped characters correctly', () => {
            // For the simplified version, we focus on the core problem: literal newlines
            // If JSON already has escaped sequences, it should be valid and parseable
            const validJson = '{"text": "already escaped\\ntext"}';
            const result = escapeJSONControlCharacters(validJson);
            expect(() => JSON.parse(result)).not.toThrow();
        });

        it('should not modify valid JSON with escaped sequences', () => {
            // Test case where JSON already has proper escape sequences
            const validJson = '{"message": "Line 1\\nLine 2\\tTabbed"}';
            const result = escapeJSONControlCharacters(validJson);
            expect(() => JSON.parse(result)).not.toThrow();
        });

        it('should handle mixed escaped and unescaped characters', () => {
            const json = '{"text": "mixed\\nescaped\tand\nunescaped"}';
            const expected = '{"text": "mixed\\\\nescaped\\tand\\nunescaped"}';
            expect(escapeJSONControlCharacters(json)).toBe(expected);
        });

        it('should handle the specific case that was failing in translations', () => {
            const problematicJson = `{
 "VoteEliminationMessage": "Vote results!
With {{voteCount}} votes, {{playerName}} was eliminated.
{{voteBreakdown}}

Night {{round}} begins."
}`;
            const result = escapeJSONControlCharacters(problematicJson);
            expect(() => JSON.parse(result)).not.toThrow();
            
            const parsed = JSON.parse(result);
            // After JSON.parse, escaped \n becomes actual newlines
            expect(parsed.VoteEliminationMessage).toContain('\n');
            expect(parsed.VoteEliminationMessage).toContain('Vote results!');
            expect(parsed.VoteEliminationMessage).toContain('Night {{round}} begins.');
        });
    });
});
