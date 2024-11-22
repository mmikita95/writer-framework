import { ref, Ref } from "vue";
import { Component, ClipboardOperation } from "@/writerTypes";

export const CANDIDATE_CONFIRMATION_DELAY_MS = 1500;

/*
Mutation transactions with the same ids are debounced.
For example, if the user edits a text a types "hello" we don't want to create
five transactions, one for "h", one for "e", etc. However, if the users types
"hello" and one second later types "world", we probably want these as separate
transactions.
*/

const MUTATIONTRANSACTION_DEBOUNCE_MS = 1000;
const MAX_LOG_ENTRIES = 100;

export type WorkflowExecutionLog = {
	summary: {
		componentId: Component["id"];
		outcome: string;
		message?: string;
		executionTimeInSeconds: number;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		result: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		returnValue: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		executionEnvironment: Record<string, any>;
	}[];
};

type ComponentMutationTransaction = {
	id: string;
	desc: string;
	timestamp: number;
	enableDebounce: boolean;
	mutations: Record<Component["id"], { jsonPre?: string; jsonPost?: string }>;
};

type LogEntryContents = {
	type: string;
	title: string;
	message: string;
	code?: string;
	workflowExecution?: WorkflowExecutionLog;
};

type LogEntry = {
	type: string;
	title: string;
	message: string;
	code?: string;
	workflowExecution?: WorkflowExecutionLog;
	timestampReceived: Date;
	fingerprint: string;
	repeated: number;
};

type SelectionSource = "click" | "tree" | "log";

type State = {
	mode: "ui" | "workflows" | "preview";
	openPanels: Set<"log" | "code">;
	selection: {
		componentId: Component["id"];
		instancePath: string;
		source: SelectionSource;
	};
	clipboard: {
		operation: ClipboardOperation;
		jsonSubtree: string;
	};
	mutationTransactionsSnapshot: {
		undo: ComponentMutationTransaction;
		redo: ComponentMutationTransaction;
	};
	logEntries: LogEntry[];
};

export function generateBuilderManager() {
	const initState: State = {
		mode: "ui",
		openPanels: new Set(),
		selection: null,
		clipboard: null,
		mutationTransactionsSnapshot: {
			undo: null,
			redo: null,
		},
		logEntries: [],
	};

	const state: Ref<State> = ref(initState);
	let activeMutationTransaction: ComponentMutationTransaction = null;
	let mutationTransactionOffset = 0;
	const mutationTransactions: ComponentMutationTransaction[] = [];

	const setMode = (newMode: State["mode"]): void => {
		state.value.mode = newMode;
	};

	const getMode = () => {
		return state.value.mode;
	};

	const setSelection = (
		componentId: Component["id"],
		instancePath?: string,
		source?: SelectionSource,
	) => {
		if (componentId === null) {
			state.value.selection = null;
			return;
		}
		let resolvedInstancePath = instancePath;
		if (typeof resolvedInstancePath == "undefined") {
			const componentFirstElement: HTMLElement = document.querySelector(
				`.ComponentRenderer [data-writer-id="${componentId}"]`,
			);
			resolvedInstancePath =
				componentFirstElement?.dataset.writerInstancePath;
		}

		state.value.selection = {
			componentId,
			instancePath: resolvedInstancePath,
			source,
		};
	};

	const isSelectionActive = () => {
		return state.value.selection !== null;
	};

	const getSelection = () => {
		return state.value.selection;
	};

	const getSelectedId = () => {
		return state.value.selection?.componentId;
	};

	const setClipboard = (clipboard: State["clipboard"]) => {
		state.value.clipboard = clipboard;
	};

	const getClipboard = () => {
		return state.value.clipboard;
	};

	const openMutationTransaction = (
		transactionId: string,
		transactionDesc: string,
		enableDebounce: boolean = false,
	) => {
		if (activeMutationTransaction !== null) return;

		// Invalidate redo transactions

		if (mutationTransactionOffset < 0) {
			mutationTransactions.splice(mutationTransactionOffset);
			mutationTransactionOffset = 0;
		}

		// Check whether to debounce instead of opening a new transaction

		const latestTransaction =
			mutationTransactions[mutationTransactions.length - 1];
		const latestTransactionAge = Date.now() - latestTransaction?.timestamp;
		if (
			latestTransaction?.enableDebounce &&
			latestTransaction?.id == transactionId &&
			latestTransactionAge < MUTATIONTRANSACTION_DEBOUNCE_MS
		) {
			activeMutationTransaction = mutationTransactions.pop();
			return;
		}
		const transaction: ComponentMutationTransaction = {
			id: transactionId,
			desc: transactionDesc,
			timestamp: null,
			enableDebounce,
			mutations: {},
		};
		activeMutationTransaction = transaction;
	};

	const registerPreMutation = (component: Component) => {
		const componentMutation =
			activeMutationTransaction.mutations[component.id];

		// For premutation, prefer the oldest possible version of the component

		if (componentMutation) return;
		activeMutationTransaction.mutations[component.id] = {
			jsonPre: component ? JSON.stringify(component) : undefined,
		};
	};

	const registerPostMutation = (component: Component) => {
		const componentMutation =
			activeMutationTransaction.mutations[component.id];

		if (!componentMutation) {
			activeMutationTransaction.mutations[component.id] = {};
		}

		// For postmutation, prefer the newest possible version of the component

		activeMutationTransaction.mutations[component.id].jsonPost = component
			? JSON.stringify(component)
			: undefined;
	};

	const closeMutationTransaction = (transactionId: string) => {
		if (activeMutationTransaction.id !== transactionId) return;
		activeMutationTransaction.timestamp = Date.now();
		mutationTransactions.push(activeMutationTransaction);
		activeMutationTransaction = null;
		refreshMutationTransactionsSnapshot();
	};

	const consumeUndoTransaction = (): ComponentMutationTransaction => {
		const index =
			mutationTransactions.length - 1 + mutationTransactionOffset;
		const transaction = mutationTransactions[index];
		if (transaction) mutationTransactionOffset--;
		refreshMutationTransactionsSnapshot();
		return transaction;
	};

	const consumeRedoTransaction = (): ComponentMutationTransaction => {
		const index = mutationTransactions.length + mutationTransactionOffset;
		const transaction = mutationTransactions[index];
		if (transaction) mutationTransactionOffset++;
		refreshMutationTransactionsSnapshot();
		return transaction;
	};

	const refreshMutationTransactionsSnapshot = () => {
		const undoIndex =
			mutationTransactions.length - 1 + mutationTransactionOffset;
		const undoTransaction = mutationTransactions[undoIndex];
		const redoIndex =
			mutationTransactions.length + mutationTransactionOffset;
		const redoTransaction = mutationTransactions[redoIndex];

		state.value.mutationTransactionsSnapshot = {
			undo: undoTransaction,
			redo: redoTransaction,
		};
	};

	const getMutationTransactionsSnapshot = () => {
		return state.value.mutationTransactionsSnapshot;
	};

	async function hashLogEntryContents(logEntry: LogEntryContents) {
		const strData = JSON.stringify(logEntry);
		let hash = 5981;
		for (let i = 0; i < strData.length; i++) {
			hash = (hash << 5) + hash + strData.charCodeAt(i);
		}
		const hashStr = hash.toString(16).padStart(2, "0");
		return hashStr;
	}

	const handleLogEntry = async (logEntryContents: LogEntryContents) => {
		const { type, title, message, code, workflowExecution } =
			logEntryContents;
		const fingerprint = await hashLogEntryContents(logEntryContents);
		const matchingEntry = state.value.logEntries.find(
			(le) => le.fingerprint === fingerprint,
		);
		if (matchingEntry) {
			matchingEntry.repeated++;
			matchingEntry.timestampReceived = new Date();
			state.value.logEntries.sort((a, b) =>
				a.timestampReceived < b.timestampReceived ? 1 : -1,
			);
			return;
		}

		state.value.logEntries.unshift({
			type,
			title,
			message,
			code,
			workflowExecution,
			timestampReceived: new Date(),
			fingerprint,
			repeated: 0,
		});
		state.value.logEntries.splice(MAX_LOG_ENTRIES);
	};

	const getLogEntryCount = () => {
		return state.value.logEntries.length;
	};

	const clearLogEntries = () => {
		state.value.logEntries = [];
	};

	const getLogEntries = () => {
		return state.value.logEntries;
	};

	const builder = {
		setMode,
		getMode,
		openPanels: state.value.openPanels,
		isSelectionActive,
		setSelection,
		getSelection,
		getSelectedId,
		setClipboard,
		getClipboard,
		openMutationTransaction,
		registerPreMutation,
		registerPostMutation,
		closeMutationTransaction,
		consumeUndoTransaction,
		consumeRedoTransaction,
		getMutationTransactionsSnapshot,
		handleLogEntry,
		getLogEntryCount,
		clearLogEntries,
		getLogEntries,
	};

	return builder;
}
