import { ProviderResult, CompletionItem, CompletionItemKind, window, SnippetString, DecorationOptions, workspace, TextEditor, Range, Position, MarkdownString, DocumentSelector, RenameProvider, WorkspaceEdit, ConfigurationTarget } from 'vscode';
import { TextDocument, ExtensionContext, languages, CompletionItemProvider } from 'vscode';
import { Parser } from './parser';

const documentSelectors: DocumentSelector[] = [
	{ scheme: "untitled" },
	{ scheme: "file" }
];

function isExtensionEnabled(doc: TextDocument): boolean {
	const config = workspace.getConfiguration("inlineSnippets", doc.uri);
	if (!config) {
		return true;
	}

	if (!config.blacklistLanguageIds) {
		return true;
	}

	const blacklistLanguageIds: string[] = config.blacklistLanguageIds;
	return blacklistLanguageIds.indexOf(doc.languageId) < 0;
}

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
	let timeouts: { [id: string]: NodeJS.Timer } = {};

	function updateEditorDecorations(editor: TextEditor, preparedParser?: DecoratingParser): DecoratingParser {
		let parser: DecoratingParser;

		if (preparedParser) {
			parser = preparedParser;
		} else {
			parser = new DecoratingParser(editor);
			if (isExtensionEnabled(editor.document)) {
				parser.parse(editor.document.getText());
			}
		}

		editor.setDecorations(tagDecorationType, parser.tagParts);
		editor.setDecorations(tagNameDecorationType, parser.tagNameParts);
		editor.setDecorations(errorDecorationType, parser.errorParts);

		return parser;
	}

	function updateDocumentDecorations(doc: TextDocument) {
		let parser: DecoratingParser | undefined;

		for (const editor of window.visibleTextEditors) {
			if (editor.document === doc) {
				parser = updateEditorDecorations(editor, parser);
			}
		}
	}

	function triggerUpdateDecorations(doc: TextDocument) {
		const uri = doc.uri.toString();
		let timeout = timeouts[uri];

		if (timeout) {
			clearTimeout(timeout);
		}

		timeouts[uri] = setTimeout(
			() => {
				delete timeouts[uri];
				updateDocumentDecorations(doc);
			},
			100
		);
	}

	function updateVisibleEditors() {
		for (const editor of window.visibleTextEditors) {
			updateEditorDecorations(editor);
		}
	}

	window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			updateEditorDecorations(editor);
		}
	}, null, context.subscriptions);

	workspace.onDidChangeTextDocument(event => {
		if (isExtensionEnabled(event.document)) {
			triggerUpdateDecorations(event.document);
		}
	}, null, context.subscriptions);

	workspace.onDidChangeConfiguration(() => {
		updateVisibleEditors();
	}, null, context.subscriptions);

	updateVisibleEditors();
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
		if (!isExtensionEnabled(document)) {
			return [];
		}

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
// MAIN CODE

// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	activateCompletion(context);
	activateDecoration(context);
}

// this method is called when your extension is deactivated
export function deactivate() { }
