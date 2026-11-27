// The panel <-> worker contract, declared once: src/web (the panel) and src/worker.ts both read it.
/** An image reference in issue text: `![alt](attachment:<id>)`, drawn as an Open preview button. */
export const ATTACHMENT_SCHEME = 'attachment:';
/** Backlog's pull request statuses. Only open ones are checked for conflicts. */
export const PR_OPEN = 1;
