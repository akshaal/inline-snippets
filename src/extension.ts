import { ProviderResult, CompletionItem, CompletionItemKind, window, SnippetString, DecorationOptions, workspace, TextEditor, Range } from 'vscode';
import { TextDocument, ExtensionContext, languages, CompletionItemProvider } from 'vscode';
import { Parser } from './parser';

const tagDecorationType = window.createTextEditorDecorationType({
	color: { id: "inlineSnippets.tagColor" }
});

const tagNameDecorationType = window.createTextEditorDecorationType({
	color: { id: "inlineSnippets.tagNameColor" }
});

const errorDecorationType = window.createTextEditorDecorationType({
	color: { id: "inlineSnippets.errorColor" }
});

class CompletionCollectingParser extends Parser {
	readonly completions: CompletionItem[] = [];

	protected onWrongTag(_tagMatch: RegExpExecArray): void {
	}

	protected onMatchingTags(text: string, startMatch: RegExpExecArray, endMatch: RegExpExecArray): void {
		const name = startMatch[1];
		const bodyStart = startMatch[0].length + startMatch.index;
		const body = text.substr(bodyStart, endMatch.index - bodyStart);

		const item = new CompletionItem(name, CompletionItemKind.Snippet);
		item.insertText = new SnippetString(body);
		item.documentation = body;
		item.detail = "File-local snippet";

		this.completions.push(item);
	}
}

class DecoratingParser extends Parser {
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

class CompletionItemProviderImpl implements CompletionItemProvider {
	provideCompletionItems(document: TextDocument): ProviderResult<CompletionItem[]> {
		const parser = new CompletionCollectingParser();
		parser.parse(document.getText());
		return parser.completions;
	}
}


// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	// Completions - - - - - - - - -  -
	const completionProviderImpl = new CompletionItemProviderImpl();

	context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "untitled" }, completionProviderImpl));
	context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "file" }, completionProviderImpl));

	// Decoration - - - - - - - - -  -
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
}

// this method is called when your extension is deactivated
export function deactivate() { }
