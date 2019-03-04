import { ProviderResult, CompletionItem, CompletionItemKind, window, SnippetString } from 'vscode';
import { TextDocument, ExtensionContext, languages, CompletionItemProvider } from 'vscode';

function createCompletionItem(name: string, body: string): CompletionItem {
	const item = new CompletionItem(name, CompletionItemKind.Snippet);
	item.insertText = new SnippetString(body);
	return item;
}

class CompletionItemProviderImpl implements CompletionItemProvider {
	provideCompletionItems(document: TextDocument): ProviderResult<CompletionItem[]> {
		const text = document.getText();

		// This thing is stateful, we don't want it to be global...
		const snippetRegex: RegExp = /<snippet:([a-zA+Z0-9]+)>(.*?)<\/snippet:([a-zA+Z0-9]+)>/g;

		const matches: RegExpMatchArray | null = text.match(snippetRegex);

		if (matches) {
			const result: CompletionItem[] = [];

			let m: RegExpExecArray | null;
			while ((m = snippetRegex.exec(text))) {
				const [, startName, body, stopName] = m;

				if (startName !== stopName) {
					window.showErrorMessage(`Local snippet: start tag != stop tag: ${startName} != ${stopName}`);
					return [];
				}

				result.push(createCompletionItem(startName, body));
			}

			return result;
		} else {
			return [];
		}
	}
}

// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	const impl = new CompletionItemProviderImpl();

	context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "untitled" }, impl));
	context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "file" }, impl));
}

// this method is called when your extension is deactivated
export function deactivate() { }
