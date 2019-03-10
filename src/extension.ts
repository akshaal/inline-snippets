import { ProviderResult, CompletionItem, CompletionItemKind, window, SnippetString, DecorationOptions, workspace, TextEditor, Range, Position, MarkdownString, DocumentSelector, RenameProvider, WorkspaceEdit } from 'vscode';
import { TextDocument, ExtensionContext, languages, CompletionItemProvider } from 'vscode';
import { Parser } from './parser';

const documentSelectors: DocumentSelector[] = [
	{ scheme: "untitled" },
	{ scheme: "file" }
];

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DECORATION

const tagDecorationType = window.createTextEditorDecorationType({
	color: { id: "inlineSnippets.tagColor" }
});

const tagNameDecorationType = window.createTextEditorDecorationType({
	color: { id: "inlineSnippets.tagNameColor" }
});

const errorDecorationType = window.createTextEditorDecorationType({
	color: { id: "inlineSnippets.errorColor" }
});


class DecoratingParser extends Parser<string> {
	readonly tagParts: DecorationOptions[] = [];
	readonly tagNameParts: DecorationOptions[] = [];
	readonly errorParts: DecorationOptions[] = [];

	constructor(private activeEditor: TextEditor) {
		super();
	}

	private pushDecorationOptions(tagMatch: RegExpExecArray, isError: boolean): void {
		const startPos = this.activeEditor.document.positionAt(tagMatch.index);
		const endIdx = tagMatch.index + tagMatch[0].length;
		const endPos = this.activeEditor.document.positionAt(endIdx);

		if (isError) {
			this.errorParts.push({
				range: new Range(startPos, endPos)
			});
		} else {
			const nameEndPos = this.activeEditor.document.positionAt(endIdx - 1);
			const nameStartPos = this.activeEditor.document.positionAt(endIdx - 1 - tagMatch[1].length);

			this.tagParts.push(
				{ range: new Range(startPos, nameStartPos) },
				{ range: new Range(nameEndPos, endPos) }
			);

			this.tagNameParts.push(
				{ range: new Range(nameStartPos, nameEndPos) },
			);
		}
	}

	protected onWrongTag(tagMatch: RegExpExecArray): void {
		this.pushDecorationOptions(tagMatch, true);
	}

	protected onMatchingTags(_text: string, startMatch: RegExpExecArray, endMatch: RegExpExecArray): void {
		this.pushDecorationOptions(startMatch, false);
		this.pushDecorationOptions(endMatch, false);
	}
}

function activateDecoration(context: ExtensionContext) {
	let activeEditor = window.activeTextEditor;

	function updateDecorations() {
		if (!activeEditor) {
			return;
		}

		const parser = new DecoratingParser(activeEditor);
		parser.parse(activeEditor.document.getText());

		activeEditor.setDecorations(tagDecorationType, parser.tagParts);
		activeEditor.setDecorations(tagNameDecorationType, parser.tagNameParts);
		activeEditor.setDecorations(errorDecorationType, parser.errorParts);
	}

	let timeout: NodeJS.Timer | undefined = undefined;
	function triggerUpdateDecorations() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		timeout = setTimeout(updateDecorations, 100);
	}

	window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			updateDecorations();
		}
	}, null, context.subscriptions);

	workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	triggerUpdateDecorations();
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// COMPLETION

const snippetCompletionItem = new CompletionItem("snippet", CompletionItemKind.Snippet);
snippetCompletionItem.insertText = new SnippetString("snippet:$1>$2</snippet:$1>$0");
snippetCompletionItem.detail = "File-local snippet";
snippetCompletionItem.documentation = new MarkdownString("Inserts a new snippet definition that is only visible inside the current file");

class CompletionCollectingParser extends Parser<"in-tag" | "in-body"> {
	readonly completions: CompletionItem[] = [];

	constructor(private offset: number, private prefix: string, private prefixedWordRange: Range | undefined) {
		super();
	}

	protected onWrongTag(tagMatch: RegExpExecArray): void | "in-tag" {
		const offset = this.offset;
		const tagStartIdx = tagMatch.index;
		const tagEndIdx = tagMatch[0].length + tagMatch.index;

		if (offset > tagStartIdx && offset < tagEndIdx) {
			return;
		}
	}

	protected onMatchingTags(text: string, startMatch: RegExpExecArray, endMatch: RegExpExecArray): void | "in-tag" | "in-body" {
		const offset = this.offset;
		const startTagStartIdx = startMatch.index;
		const bodyStartIdx = startTagStartIdx + startMatch[0].length;
		const bodyEndIdx = endMatch.index;

		if (offset >= bodyStartIdx && offset <= bodyEndIdx) {
			return "in-body";
		}

		if (offset > startTagStartIdx && offset < bodyStartIdx) {
			return "in-tag";
		}

		if (offset > bodyEndIdx && offset < bodyEndIdx + endMatch[0].length) {
			return "in-tag";
		}

		const name = startMatch[1];
		const prefixed = this.isPrefixedName(name);

		let completionRange: Range | undefined = undefined;

		if (prefixed) {
			if (this.prefix !== name[0]) {
				return;
			}

			completionRange = this.prefixedWordRange;
		}

		const body = text.substr(bodyStartIdx, bodyEndIdx - bodyStartIdx);

		const item = new CompletionItem(name, CompletionItemKind.Snippet);
		item.insertText = new SnippetString(body);
		item.documentation = body;
		item.detail = "File-local snippet";
		item.range = completionRange;

		this.completions.push(item);
	}
}

class CompletionItemProviderImpl implements CompletionItemProvider {
	provideCompletionItems(document: TextDocument, position: Position): ProviderResult<CompletionItem[]> {
		const range = document.getWordRangeAtPosition(position);
		const prefixCol = (range ? range.start : position).character - 1;
		const prefix = prefixCol >= 0 ? document.lineAt(position).text[prefixCol] : '';

		let prefixedWordRange: Range | undefined;
		if (prefix === '') {
			prefixedWordRange = undefined;
		} else {
			if (range) {
				prefixedWordRange = new Range(position.with(undefined, prefixCol), range.end);
			} else {
				prefixedWordRange = new Range(position.with(undefined, prefixCol), position);
			}
		}

		const offset = document.offsetAt(position);
		const parser = new CompletionCollectingParser(offset, prefix, prefixedWordRange);

		const rc = parser.parse(document.getText());
		if (rc === "in-body") {
			return [];
		} else if (rc === "in-tag") {
			return [];
		} else {
			if (prefix === '<') {
				parser.completions.push(snippetCompletionItem);
			}

			return parser.completions;
		}
	}
}

function activateCompletion(context: ExtensionContext) {
	const completionProviderImpl = new CompletionItemProviderImpl();

	for (const documentSelector of documentSelectors) {
		context.subscriptions.push(languages.registerCompletionItemProvider(documentSelector, completionProviderImpl));
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// RENAME PROVIDER

class RenameMatchingParser extends Parser<"done"> {
	positionRenameRange: Range | undefined;
	matchRenameRange: Range | undefined;

	constructor(private offset: number, private document: TextDocument) {
		super();
	}

	protected onWrongTag(tagMatch: RegExpExecArray): void | "done" {
		const offset = this.offset;
		const tagStartIdx = tagMatch.index;
		const tagEndIdx = tagMatch[0].length + tagMatch.index;

		if (offset >= tagStartIdx && offset < tagEndIdx) {
			return "done";
		}
	}
	
	protected onMatchingTags(text: string, startMatch: RegExpExecArray, endMatch: RegExpExecArray): void | "done" {
		const offset = this.offset;
		const startTagStartIdx = startMatch.index;
		const bodyStartIdx = startTagStartIdx + startMatch[0].length;
		const bodyEndIdx = endMatch.index;

		if (offset >= bodyStartIdx && offset <= bodyEndIdx) {
			return "done";
		}

		const endIdx = bodyEndIdx + endMatch[0].length;

		const makeRanges = (): [Range, Range] => {
			const name = startMatch[1];

			return [
				new Range(
					this.document.positionAt(bodyStartIdx - name.length - 1),
					this.document.positionAt(bodyStartIdx - 1)
				),

				new Range(
					this.document.positionAt(endIdx - name.length - 1),
					this.document.positionAt(endIdx - 1)
				)
			];
		};

		if (offset >= startTagStartIdx && offset < bodyStartIdx) {
			[this.positionRenameRange, this.matchRenameRange] = makeRanges();
			return "done";
		}
 
		if (offset >= bodyEndIdx && offset < endIdx) {
			[this.matchRenameRange, this.positionRenameRange] = makeRanges();
			return "done";
		}
	}
}

class RenameProviderImpl implements RenameProvider {
	prepareRename?(document: TextDocument, position: Position): Range | undefined {
		const offset = document.offsetAt(position);
		const parser = new RenameMatchingParser(offset, document);

		parser.parse(document.getText());

		return parser.positionRenameRange;
	}

	provideRenameEdits(document: TextDocument, position: Position, newName: string): WorkspaceEdit | undefined {
		const offset = document.offsetAt(position);
		const parser = new RenameMatchingParser(offset, document);

		parser.parse(document.getText());

		if (parser.matchRenameRange && parser.positionRenameRange) {
			const we = new WorkspaceEdit();
			we.replace(document.uri, parser.matchRenameRange, newName);
			we.replace(document.uri, parser.positionRenameRange, newName);
			return we;
		}

		return undefined;
	}
}

function activateRename(context: ExtensionContext) {
	const renameProviderImpl = new RenameProviderImpl();

	for (const documentSelector of documentSelectors) {
		context.subscriptions.push(languages.registerRenameProvider(documentSelector, renameProviderImpl));
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MAIN CODE

// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	activateCompletion(context);
	activateDecoration(context);
	activateRename(context);
}

// this method is called when your extension is deactivated
export function deactivate() { }
