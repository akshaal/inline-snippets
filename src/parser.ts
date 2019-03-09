export abstract class Parser<T extends string> {
	protected abstract onWrongTag(tagMatch: RegExpExecArray): void | T;
	protected abstract onMatchingTags(text: string, startMatch: RegExpExecArray, endMatch: RegExpExecArray): void | T;

	private onUnknownTagPair(text: string, startMatch: RegExpExecArray, endMatch: RegExpExecArray): void | T {
		const startName = startMatch[1];
		const endName = endMatch[1];

		if (startName === endName) {
			return this.onMatchingTags(text, startMatch, endMatch);
		} else {
			const rc = this.onWrongTag(startMatch);
			if (typeof rc === "string") {
				return rc;
			}

			return this.onWrongTag(endMatch);
		}
	}

	parse(text: string): void | T {
		const snippetStartRegex: RegExp = /<snippet:([!#%&/=?`'|\\*+]{0,1}[a-zA+Z0-9]+)>/g;
		const snippetEndRegex: RegExp = /<\/snippet:([!#%&/=?`'|\\*+]{0,1}[a-zA+Z0-9]+)>/g;

		let startMatch: RegExpExecArray | null = snippetStartRegex.exec(text);

		let rc: T | void;

		while (true) {
			let endMatch: RegExpExecArray | null;

			while (true) {
				endMatch = snippetEndRegex.exec(text);

				if (endMatch) {
					if (!startMatch || startMatch.index > endMatch.index) {
						// There is no start or start is after end, it means wrong end
						if (typeof (rc = this.onWrongTag(endMatch)) === "string") {
							return rc;
						}
					} else {
						// There is start and it's before end
						break;
					}
				} else {
					if (startMatch) {
						// There no end, but there is start... just consume all starts and return
						do {
							if (typeof (rc = this.onWrongTag(startMatch)) === "string") {
								return rc;
							}
						} while ((startMatch = snippetStartRegex.exec(text)));
					}

					// At this point there is no end tag and all start tags are consumed
					return;
				}
			}

			// There is a start and it's before the end
			// What about next start?
			let nextStartMatch: RegExpExecArray | null;

			while ((nextStartMatch = snippetStartRegex.exec(text))) {
				if (nextStartMatch.index < endMatch.index) {
					if (typeof (rc = this.onWrongTag(startMatch)) === "string") {
						return rc;
					}
					startMatch = nextStartMatch;
				} else {
					break;
				}
			}

			if (typeof (rc = this.onUnknownTagPair(text, startMatch, endMatch)) === "string") {
				return rc;
			}

			if (nextStartMatch) {
				// There is a next start and it is after end
				startMatch = nextStartMatch;
			} else {
				// There is no next start match.... it means this is the last start
				// How about more end tags?
				// Because there is no start, we can just mark all of them as wrong ones
				while ((endMatch = snippetEndRegex.exec(text))) {
					if (typeof (rc = this.onWrongTag(endMatch)) === "string") {
						return rc;
					}
				}

				return;
			}
		}
	}
}
