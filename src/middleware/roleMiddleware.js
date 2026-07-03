/**
 * Normalize DB/JWT role strings to route enum values (SUPER_ADMIN, ADMIN, MANAGER, CASHIER).
 * User model may store "admin", "ADMIN", "manager", etc.
 */
const normalizeRouteRole = (role) => {
	const raw = String(role || '').trim();
	if (!raw) return '';

	const upper = raw.toUpperCase().replace(/\s+/g, '_');
	const map = {
		SUPERADMIN: 'SUPER_ADMIN',
		SUPER_ADMIN: 'SUPER_ADMIN',
		ADMINISTRATOR: 'ADMIN',
		ADMINS: 'ADMIN',
		ADMIN: 'ADMIN',
		BRANCH_MANAGER: 'MANAGER',
		STORE_MANAGER: 'MANAGER',
		FLOOR_MANAGER: 'MANAGER',
		SHIFT_MANAGER: 'MANAGER',
		AREA_MANAGER: 'MANAGER',
		REGIONAL_MANAGER: 'MANAGER',
		MANAGER: 'MANAGER',
		CASHIERS: 'CASHIER',
		CASHIER: 'CASHIER',
		EMPLOYEE: 'CASHIER',
		EMPLOYEES: 'CASHIER',
		USER: 'CASHIER',
	};

	if (map[upper]) return map[upper];

	const lower = raw.toLowerCase().replace(/\s+/g, '_');
	if (lower === 'admin' || lower === 'super_admin' || lower === 'superadmin') {
		return lower === 'super_admin' || lower === 'superadmin' ? 'SUPER_ADMIN' : 'ADMIN';
	}
	if (lower === 'manager' || lower.endsWith('_manager')) return 'MANAGER';
	if (['cashier', 'employee', 'user'].includes(lower)) return 'CASHIER';

	return upper;
};

const authorizeRoles = (...roles) => (req, res, next) => {
	const userRole = normalizeRouteRole(req.user?.role);
	const allowed = roles.map((r) => normalizeRouteRole(r));

	if (!req.user || !userRole || !allowed.includes(userRole)) {
		return res.status(403).json({
			success: false,
			message: `Access denied for this role (${req.user?.role ?? 'unknown'}).`,
		});
	}

	next();
};

module.exports = { authorizeRoles, normalizeRouteRole };
