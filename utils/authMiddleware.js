// Vérifie que le joueur est connecté
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Session expirée ou non connectée. Veuillez vous reconnecter." });
    }
    next();
}

// Vérifie que le joueur est administrateur
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: "Accès refusé. Réservé aux administrateurs." });
    }
    next();
}

module.exports = { requireAuth, requireAdmin };
