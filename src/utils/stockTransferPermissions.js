/**
 * Stock transfer role permissions, branch scoping, and workflow helpers.
 * Aligns with routes in stockTransferRoutes.js and StockTransfer status enum.
 */

const mongoose = require('mongoose');

const MANAGER_ROLE_ALIASES = new Set([
	'manager',
	'branch_manager',
	'store_manager',
	'floor_manager',
	'shift_manager',
	'area_manager',
	'regional_manager',
]);

const ADMIN_ROLE_ALIASES = new Set(['admin', 'super_admin', 'superadmin', 'administrator', 'admins']);

const CASHIER_ROLE_ALIASES = new Set(['cashier', 'cashiers', 'employee', 'employees', 'user']);

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'REJECTED']);

const WORKFLOW_STEPS = [
	{ key: 'PENDING', label: 'Pending' },
	{ key: 'APPROVED', label: 'Approved' },
	{ key: 'IN_TRANSIT', label: 'In Transit' },
	{ key: 'COMPLETED', label: 'Completed' },
];

/** Uppercase API / DB status */
const normalizeTransferStatus = (status) => {
	const raw = String(status || '').trim();
	if (!raw) return 'PENDING';

	const upper = raw.toUpperCase().replace(/\s+/g, '_');
	const map = {
		PENDING: 'PENDING',
		APPROVED: 'APPROVED',
		REJECTED: 'REJECTED',
		IN_TRANSIT: 'IN_TRANSIT',
		COMPLETED: 'COMPLETED',
		CANCELLED: 'CANCELLED',
	};

	if (map[upper]) return map[upper];

	const title = raw
		.replace(/_/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
	const fromTitle = {
		Pending: 'PENDING',
		Approved: 'APPROVED',
		Rejected: 'REJECTED',
		'In Transit': 'IN_TRANSIT',
		Completed: 'COMPLETED',
		Cancelled: 'CANCELLED',
	};
	return fromTitle[title] || upper;
};

/** UI label for a normalized status */
const statusToLabel = (status) => {
	const step = WORKFLOW_STEPS.find((s) => s.key === normalizeTransferStatus(status));
	if (step) return step.label;
	const key = normalizeTransferStatus(status);
	if (key === 'REJECTED') return 'Rejected';
	if (key === 'CANCELLED') return 'Cancelled';
	return key;
};

/**
 * Normalize app / API role strings (DB: MANAGER, legacy: manager).
 * Returns: super_admin | admin | manager | cashier | unknown slug
 */
const normalizeStockRole = (role) => {
	const r = String(role || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '_');

	if (!r) return 'unknown';
	if (r === 'super_admin' || r === 'superadmin') return 'super_admin';
	if (ADMIN_ROLE_ALIASES.has(r)) return 'admin';
	if (MANAGER_ROLE_ALIASES.has(r) || (r.endsWith('_manager') && !ADMIN_ROLE_ALIASES.has(r))) {
		return 'manager';
	}
	if (CASHIER_ROLE_ALIASES.has(r)) return 'cashier';

	// Uppercase enum passthrough
	const upper = String(role || '').trim().toUpperCase();
	if (upper === 'SUPER_ADMIN') return 'super_admin';
	if (upper === 'ADMIN') return 'admin';
	if (upper === 'MANAGER') return 'manager';
	if (['CASHIER', 'EMPLOYEE', 'USER'].includes(upper)) return 'cashier';

	return r;
};

/** Map backend User document → permission role slug */
const normalizeStockRoleFromUser = (user) => normalizeStockRole(user?.role ?? user?.roleName ?? '');

const isSuperAdminRole = (role) => normalizeStockRole(role) === 'super_admin';
const isAdminRole = (role) => ['super_admin', 'admin'].includes(normalizeStockRole(role));
const isManagerRole = (role) => normalizeStockRole(role) === 'manager';
const isCashierRole = (role) => normalizeStockRole(role) === 'cashier';

const getStockTransferPermissions = (role) => {
	const r = normalizeStockRole(role);
	const isSuperAdmin = r === 'super_admin';
	const isAdmin = isSuperAdmin || r === 'admin';
	const isManager = r === 'manager';
	const isCashier = r === 'cashier';
	const canView = isAdmin || isManager || isCashier;

	return {
		role: r,
		label: isSuperAdmin
			? 'Super Admin'
			: isAdmin
				? 'Admin'
				: isManager
					? 'Manager'
					: isCashier
						? 'Cashier'
						: r,
		isViewOnly: isCashier,
		isSuperAdmin,
		isAdmin,
		isManager,
		isCashier,

		canViewTransfers: canView,
		canViewTransferStatus: canView,
		canViewTransferHistory: canView,
		canViewMovements: isAdmin || isManager,
		canViewAnalytics: isAdmin || isManager || isCashier,
		canViewTransferLogs: isAdmin,
		canViewBranchAvailability: isAdmin || isManager || isCashier,
		canCreateTransfer: isManager,
		canEditTransfer: isManager,
		canDeleteTransfer: isManager,
		canCancelOwnTransfer: isManager,
		canApproveTransfer: isAdmin,
		canRejectTransfer: isAdmin,
		canDispatchTransfer: isManager,
		canAdminCancelTransfer: isAdmin,
		canConfirmReceipt: isManager,
		canAdvanceProgress: isManager,
		canModifyProgress: isManager,
		canTrackProgress: canView,
		canTrackAllProgress: isAdmin,
		canViewAllBranches: isAdmin,
		canViewBranchReports: isAdmin || isManager || isCashier,
		viewScope: isAdmin ? 'all' : 'branch',

		tabs: {
			request: isManager,
			tracking: canView,
			availability: isAdmin || isManager || isCashier,
			history: canView,
			reports: isAdmin || isManager || isCashier,
			logs: isAdmin,
		},
		defaultTab: isAdmin ? 'tracking' : isManager ? 'request' : 'tracking',
	};
};

const getPermissionsForUser = (user, branches = []) => {
	const base = getStockTransferPermissions(normalizeStockRoleFromUser(user));
	const branchIds = getUserBranchIds(user, branches);
	const hasBranchAssigned = branchIds.length > 0;
	const managerWithBranch = base.isManager && hasBranchAssigned;

	const cashierPerms = base.isCashier
		? {
				canViewBranchReports: true,
				canViewAnalytics: true,
				canTrackProgress: true,
				viewScope: hasBranchAssigned ? 'branch' : 'all',
				tabs: {
					...base.tabs,
					tracking: true,
					history: true,
					reports: true,
					availability: true,
				},
			}
		: {};

	const managerPerms = base.isManager
		? {
				canTrackProgress: true,
				canViewBranchReports: true,
				canViewAnalytics: true,
				viewScope: hasBranchAssigned ? 'branch' : 'all',
			}
		: {};

	return {
		...base,
		...cashierPerms,
		...managerPerms,
		branchIds,
		hasBranchAssigned,
		canCreateTransfer: base.isManager,
		canEditTransfer: base.isManager,
		canDeleteTransfer: base.isManager,
		canCancelOwnTransfer: base.isManager,
		canConfirmReceipt: base.isManager,
		canDispatchTransfer: base.isManager,
		canAdvanceProgress: base.isManager,
		canModifyProgress: base.isManager,
		canViewBranchAvailability:
			base.isCashier ||
			(base.canViewBranchAvailability &&
				(base.isAdmin || base.isSuperAdmin || hasBranchAssigned)),
	};
};

const getTransferBranchIds = (transfer) => {
	const fromBranchId = String(
		transfer?.fromBranchId ??
			transfer?.fromBranch?._id ??
			transfer?.fromBranch ??
			'',
	);
	const toBranchId = String(
		transfer?.toBranchId ?? transfer?.toBranch?._id ?? transfer?.toBranch ?? '',
	);
	return { fromBranchId, toBranchId };
};

const getUserBranchIds = (user, branches = []) => {
	const raw = user?.branchId ?? user?.branch?._id ?? user?.branch;
	if (raw == null || raw === '') return [];

	const str = String(raw);
	const byId = branches.find((b) => String(b.id ?? b._id) === str);
	if (byId) return [String(byId.id ?? byId._id)];

	const byName = branches.find((b) => b.name?.toLowerCase() === str.toLowerCase());
	if (byName) return [String(byName.id ?? byName._id)];

	return [str];
};

const getUserBranchNames = (user, branches = []) => {
	const ids = getUserBranchIds(user, branches);
	return ids
		.map((id) => branches.find((b) => String(b.id ?? b._id) === id)?.name)
		.filter(Boolean);
};

const transferTouchesBranch = (transfer, userBranchIds, branches = []) => {
	if (!userBranchIds?.length) return false;

	const { fromBranchId, toBranchId } = getTransferBranchIds(transfer);
	const idSet = new Set(userBranchIds.map(String));
	const nameSet = new Set(
		userBranchIds
			.map((id) => branches.find((b) => String(b.id ?? b._id) === id)?.name)
			.filter(Boolean),
	);

	return (
		(fromBranchId && idSet.has(fromBranchId)) ||
		(toBranchId && idSet.has(toBranchId)) ||
		nameSet.has(transfer.from) ||
		nameSet.has(transfer.to)
	);
};

const isOutboundFromUserBranch = (transfer, userBranchIds) => {
	if (!userBranchIds?.length) return false;
	const { fromBranchId } = getTransferBranchIds(transfer);
	return userBranchIds.some((id) => String(id) === fromBranchId);
};

const isInboundToUserBranch = (transfer, userBranchIds, branches = []) => {
	if (!userBranchIds?.length) return false;
	const { toBranchId } = getTransferBranchIds(transfer);
	return userBranchIds.some((id) => {
		if (toBranchId && String(id) === toBranchId) return true;
		const name = branches.find((b) => String(b.id ?? b._id) === id)?.name;
		return name && name === transfer.to;
	});
};

const filterTransfersByScope = (transfers, perms, userBranchIds, branches = []) => {
	if (perms?.viewScope === 'all') return transfers;
	if (!userBranchIds?.length) return [];
	return transfers.filter((t) => transferTouchesBranch(t, userBranchIds, branches));
};

/** MongoDB filter for branch-scoped list queries */
const buildTransferScopeFilter = (user, branches = []) => {
	const perms = getPermissionsForUser(user, branches);
	if (perms.viewScope === 'all') return {};

	const userBranchIds = getUserBranchIds(user, branches);
	const orClauses = [];

	if (userBranchIds.length) {
		const branchObjectIds = userBranchIds
			.filter((id) => mongoose.Types.ObjectId.isValid(id))
			.map((id) => new mongoose.Types.ObjectId(id));

		if (branchObjectIds.length) {
			orClauses.push(
				{ fromBranch: { $in: branchObjectIds } },
				{ toBranch: { $in: branchObjectIds } },
			);
		}
	}

	// Managers always see transfers they created (even if branch id on profile mismatches)
	if (perms.isManager && user?._id) {
		orClauses.push({ createdBy: user._id });
	}

	if (!orClauses.length) {
		return perms.isManager || perms.isCashier ? {} : { _id: { $in: [] } };
	}

	return { $or: orClauses };
};

const canCreateTransfer = (perms) => Boolean(perms?.canCreateTransfer);

const canEditTransfer = (transfer, perms) =>
	Boolean(perms?.canEditTransfer) &&
	normalizeTransferStatus(transfer.status) === 'PENDING';

const canDeleteTransfer = (transfer, perms) => canEditTransfer(transfer, perms);

const canManagerCancelOwnTransfer = (transfer, perms) =>
	Boolean(perms?.canCancelOwnTransfer) &&
	normalizeTransferStatus(transfer.status) === 'PENDING';

const canAdminCancelTransfer = (transfer, perms) =>
	Boolean(perms?.canAdminCancelTransfer) &&
	normalizeTransferStatus(transfer.status) === 'PENDING';

const canViewTransferRecord = (transfer, user, branches = []) => {
	const perms = getPermissionsForUser(user, branches);
	if (!perms.canViewTransfers) return false;
	if (perms.viewScope === 'all') return true;
	return transferTouchesBranch(transfer, getUserBranchIds(user, branches), branches);
};

const getTransferViewDenial = (user, transfer, branches = []) =>
	canViewTransferRecord(transfer, user, branches)
		? null
		: 'You do not have access to transfers outside your branch.';

const canCancelTransfer = (transfer, perms, userBranchIds = [], branches = []) =>
	canManagerCancelOwnTransfer(transfer, perms, userBranchIds, branches) ||
	canAdminCancelTransfer(transfer, perms);

const canApproveTransfer = (transfer, perms) =>
	Boolean(perms?.canApproveTransfer) &&
	normalizeTransferStatus(transfer.status) === 'PENDING';

const canRejectTransfer = (transfer, perms) =>
	Boolean(perms?.canRejectTransfer) &&
	normalizeTransferStatus(transfer.status) === 'PENDING';

const canDispatchTransfer = (transfer, perms) =>
	Boolean(perms?.canDispatchTransfer) &&
	normalizeTransferStatus(transfer.status) === 'APPROVED';

const canReviewPendingTransfer = (transfer, perms) => canApproveTransfer(transfer, perms);

const canConfirmReceipt = (transfer, perms, userBranchIds = [], branches = []) => {
	if (!perms?.canConfirmReceipt) return false;
	if (normalizeTransferStatus(transfer.status) !== 'IN_TRANSIT') return false;
	if (!userBranchIds?.length) return true;
	return isInboundToUserBranch(transfer, userBranchIds, branches);
};

/** Admin tracks progress but cannot dispatch / complete / edit after review */
const isAdminProgressViewOnly = (transfer, perms) =>
	Boolean(perms?.canApproveTransfer) &&
	normalizeTransferStatus(transfer.status) !== 'PENDING';

const isManagerViewOnlyStatus = (transfer, perms) =>
	Boolean(perms?.canCreateTransfer) &&
	!perms?.canApproveTransfer &&
	TERMINAL_STATUSES.has(normalizeTransferStatus(transfer.status));

const isActiveForProgressTab = (transfer, perms) => {
	const status = normalizeTransferStatus(transfer.status);
	if (TERMINAL_STATUSES.has(status)) return false;
	if (status === 'REJECTED') return Boolean(perms?.canEditTransfer || perms?.canTrackAllProgress);
	return true;
};

const getWorkflowStepIndex = (status) => {
	const normalized = normalizeTransferStatus(status);
	if (normalized === 'REJECTED' || normalized === 'CANCELLED') return -1;
	const index = WORKFLOW_STEPS.findIndex((step) => step.key === normalized);
	return index >= 0 ? index : 0;
};

/** Per-transfer action flags for API / UI (e.g. GET /stock-transfers/:id) */
const getTransferActions = (transfer, user, branches = []) => {
	const perms = getPermissionsForUser(user);
	const userBranchIds = getUserBranchIds(user, branches);

	return {
		canView: perms.canViewTransfers,
		canEdit: canEditTransfer(transfer, perms),
		canDelete: canDeleteTransfer(transfer, perms),
		canCancel: canCancelTransfer(transfer, perms, userBranchIds, branches),
		canApprove: canApproveTransfer(transfer, perms),
		canReject: canRejectTransfer(transfer, perms),
		canDispatch: canDispatchTransfer(transfer, perms),
		canConfirmReceipt: canConfirmReceipt(transfer, perms, userBranchIds, branches),
		isViewOnly:
			perms.isViewOnly ||
			isManagerViewOnlyStatus(transfer, perms) ||
			isAdminProgressViewOnly(transfer, perms),
		isProgressViewOnly:
			isManagerViewOnlyStatus(transfer, perms) || isAdminProgressViewOnly(transfer, perms),
		workflowStepIndex: getWorkflowStepIndex(transfer.status),
		workflowLabel: statusToLabel(transfer.status),
	};
};

/** Denial message for manager create (matches controller validation) */
const getCreateTransferDenial = (user) => {
	const perms = getPermissionsForUser(user);
	if (!canCreateTransfer(perms)) {
		return 'Only managers can create stock transfer requests.';
	}
	return null;
};

/** Denial message for manager edit / delete / cancel while pending */
const getManagerPendingTransferDenial = (user, transfer) => {
	const perms = getPermissionsForUser(user);

	if (!perms.isManager) {
		return 'Only managers can modify pending transfer requests.';
	}
	if (normalizeTransferStatus(transfer.status) !== 'PENDING') {
		return 'Transfer can only be edited or cancelled before admin approval.';
	}
	return null;
};

/** Denial message for manager dispatch (APPROVED → IN_TRANSIT) */
const getDispatchTransferDenial = (user, transfer) => {
	const perms = getPermissionsForUser(user);
	if (!perms.isManager) {
		return 'Only managers can dispatch approved transfers.';
	}
	if (normalizeTransferStatus(transfer.status) !== 'APPROVED') {
		return 'Only APPROVED transfers can be dispatched.';
	}
	return null;
};

/** Denial message for inbound receipt */
const getConfirmReceiptDenial = (user, transfer, branches = []) => {
	const perms = getPermissionsForUser(user);
	const userBranchIds = getUserBranchIds(user, branches);

	if (!perms.isManager) {
		return 'Only managers can confirm receipt.';
	}
	if (normalizeTransferStatus(transfer.status) !== 'IN_TRANSIT') {
		return 'Only IN_TRANSIT transfers can be completed.';
	}
	if (userBranchIds.length && !isInboundToUserBranch(transfer, userBranchIds, branches)) {
		return 'Managers can only confirm receipt for inbound transfers to their branch.';
	}
	return null;
};

/** MongoDB filter for movement history scoped to user branches */
const buildMovementScopeFilter = (user, branches = []) => {
	const perms = getPermissionsForUser(user, branches);
	if (perms.viewScope === 'all') return {};

	const userBranchIds = getUserBranchIds(user, branches);
	if (!userBranchIds.length) {
		return { _id: { $in: [] } };
	}

	const branchObjectIds = userBranchIds
		.filter((id) => mongoose.Types.ObjectId.isValid(id))
		.map((id) => new mongoose.Types.ObjectId(id));

	return { branch: { $in: branchObjectIds } };
};

module.exports = {
	MANAGER_ROLE_ALIASES,
	WORKFLOW_STEPS,
	TERMINAL_STATUSES,
	normalizeTransferStatus,
	statusToLabel,
	normalizeStockRole,
	normalizeStockRoleFromUser,
	isSuperAdminRole,
	isAdminRole,
	isManagerRole,
	isCashierRole,
	getStockTransferPermissions,
	getPermissionsForUser,
	getTransferBranchIds,
	getUserBranchIds,
	getUserBranchNames,
	transferTouchesBranch,
	isOutboundFromUserBranch,
	isInboundToUserBranch,
	filterTransfersByScope,
	buildTransferScopeFilter,
	buildMovementScopeFilter,
	canCreateTransfer,
	canEditTransfer,
	canDeleteTransfer,
	canManagerCancelOwnTransfer,
	canAdminCancelTransfer,
	canViewTransferRecord,
	getTransferViewDenial,
	canCancelTransfer,
	canApproveTransfer,
	canRejectTransfer,
	canDispatchTransfer,
	canReviewPendingTransfer,
	canConfirmReceipt,
	isAdminProgressViewOnly,
	isManagerViewOnlyStatus,
	isActiveForProgressTab,
	getWorkflowStepIndex,
	getTransferActions,
	getCreateTransferDenial,
	getManagerPendingTransferDenial,
	getDispatchTransferDenial,
	getConfirmReceiptDenial,
};
