import * as assert from 'assert';
import { Parser } from '../parser';

class TestParser extends Parser {
    parsed: string = "";

    protected onWrongTag(tagMatch: RegExpExecArray): void {
        this.parsed += `[${tagMatch[0]}]`;
    }

	protected onMatchingTags(startMatch: RegExpExecArray, endMatch: RegExpExecArray): void {
        this.parsed += `(${startMatch[0]}, ${endMatch[0]})`;
    }
}

suite("Parser Tests", function () {
    test("Test 1", function () {
        const parser = new TestParser();
        parser.parse("");
        assert.equal(parser.parsed, "");
    });

    test("Test 2", function () {
        const parser = new TestParser();
        parser.parse("<snippet:xx>");
        assert.equal(parser.parsed, "[<snippet:xx>]");
    });

    test("Test 3", function () {
        const parser = new TestParser();
        parser.parse("</snippet:xx>");
        assert.equal(parser.parsed, "[</snippet:xx>]");
    });

    test("Test 4", function () {
        const parser = new TestParser();
        parser.parse("</snippet:xx><snippet:xx>");
        assert.equal(parser.parsed, "[</snippet:xx>][<snippet:xx>]");
    });

    test("Test 5", function () {
        const parser = new TestParser();
        parser.parse("<snippet:xx></snippet:yy>");
        assert.equal(parser.parsed, "[<snippet:xx>][</snippet:yy>]");
    });

    test("Test 6", function () {
        const parser = new TestParser();
        parser.parse("<snippet:xx><snippet:xx>");
        assert.equal(parser.parsed, "[<snippet:xx>][<snippet:xx>]");
    });

    test("Test 7", function () {
        const parser = new TestParser();
        parser.parse("</snippet:xx></snippet:xx>");
        assert.equal(parser.parsed, "[</snippet:xx>][</snippet:xx>]");
    });

    test("Test 8", function () {
        const parser = new TestParser();
        parser.parse("<snippet:xx></snippet:xx>");
        assert.equal(parser.parsed, "(<snippet:xx>, </snippet:xx>)");
    });

    test("Test 9", function () {
        const parser = new TestParser();
        parser.parse("<snippet:xx><snippet:xx></snippet:xx></snippet:xx>");
        assert.equal(parser.parsed, "[<snippet:xx>](<snippet:xx>, </snippet:xx>)[</snippet:xx>]");
    });

    test("Test 10", function () {
        const parser = new TestParser();
        parser.parse("<snippet:xx><snippet:xx></snippet:xx></snippet:xx2>");
        assert.equal(parser.parsed, "[<snippet:xx>](<snippet:xx>, </snippet:xx>)[</snippet:xx2>]");
    });
});
