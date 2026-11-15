import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectId = process.env.FIREBASE_PROJECT_ID || 'strange-bird-467010-q9';
const databaseId = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-remixremixcloudv-42a2b61a-2d55-4ff5-9eec-86f128500033';
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const serviceAccount = serviceAccountJson ? JSON.parse(serviceAccountJson) : null;

const firebaseApp = getApps()[0] || initializeApp({
    credential: serviceAccount
      ? cert(serviceAccount)
      : applicationDefault(),
    projectId,
  });

const firebaseAuth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp, databaseId);
const app = express();
const port = Number(process.env.PORT || 3001);
const allowedAdminUids = new Set(
  (process.env.ADMIN_UIDS || '').split(',').map((uid) => uid.trim()).filter(Boolean),
);

type AdminRequest = Request & { adminUid?: string };

function sendError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  const idToken = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) return sendError(res, 401, 'Sign in to continue.');

  try {
    const decoded = await firebaseAuth.verifyIdToken(idToken, true);
    if (!allowedAdminUids.has(decoded.uid)) {
      return sendError(res, 403, 'This account is not authorized to access the admin dashboard.');
    }
    req.adminUid = decoded.uid;
    next();
  } catch {
    return sendError(res, 401, 'Your sign-in has expired. Please sign in again.');
  }
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return typeof value === 'string' ? value : null;
}

function readAvatarUrl(data: DocumentData): string {
  const candidates = [
    data.avatarUrl, data.avatarURL, data.avatar_url, data['avatar url'], data['avater url'],
    data.photoURL, data.photoUrl, data.photo_url, data.profileUrl, data.profileURL, data['profile url'],
    data.avatar?.url, data.photo?.url, data.profile?.avatarUrl, data.profile?.photoURL,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      const url = new URL(candidate.trim());
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
    } catch {
      continue;
    }
  }
  return '';
}

function userSummary(id: string, data: DocumentData) {
  const usedBytes = Number(data.usedStorageBytes ?? data.storageUsed ?? 0) || 0;
  const maxBytes = Number(data.maxStorageBytes ?? 100 * 1024 ** 2) || 100 * 1024 ** 2;
  const planId = typeof data.planId === 'string' ? data.planId : '100mb';
  return {
    id,
    email: typeof data.email === 'string' ? data.email : '',
    name: typeof data.displayName === 'string'
      ? data.displayName
      : typeof data.name === 'string' ? data.name : '',
    avatarUrl: readAvatarUrl(data),
    plan: typeof data.plan === 'string' ? data.plan : '100 MB Free',
    planId,
    usedBytes,
    maxBytes,
    fileCount: Number(data.fileCount ?? 0) || 0,
    updatedAt: toIso(data.updatedAt),
    planStatus: planId === '100mb' ? 'Free' : 'Assigned',
    whopMembershipStatus: typeof data.whopMembershipStatus === 'string' ? data.whopMembershipStatus : '',
    whopCancelAtPeriodEnd: typeof data.whopCancelAtPeriodEnd === 'boolean' ? data.whopCancelAtPeriodEnd : null,
    whopCurrentPeriodEnd: toIso(data.whopCurrentPeriodEnd),
  };
}

function serializeRecord(doc: QueryDocumentSnapshot) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    uploadedAt: toIso(data.uploadedAt),
  };
}

app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
  try {
    const snapshot = await firestore.collection('users').limit(1000).get();
    const users = snapshot.docs
      .map((doc) => userSummary(doc.id, doc.data()))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const paidUsers = users.filter((user) => user.planId !== '100mb').length;
    const estimatedMonthlyRevenue = users.reduce((sum, user) => {
      if (user.planId === '50gb') return sum + 3.99;
      if (user.planId === '250gb') return sum + 6.99;
      if (user.planId === '1tb') return sum + 13.99;
      return sum;
    }, 0);

    return res.set('Cache-Control', 'no-store').json({
      users,
      metrics: {
        totalUsers: users.length,
        paidUsers,
        freeUsers: users.length - paidUsers,
        estimatedMonthlyRevenue,
        totalStorageBytes: users.reduce((sum, user) => sum + user.usedBytes, 0),
      },
      truncated: snapshot.size === 1000,
    });
  } catch (error) {
    console.error('Admin overview load failed:', error instanceof Error ? error.message : 'unknown error');
    return sendError(res, 500, 'Could not load dashboard data.');
  }
});

app.get('/api/admin/feedback', requireAdmin, async (_req, res) => {
  try {
    const snapshot = await firestore.collectionGroup('feedback').limit(500).get();
    const feedback = snapshot.docs
      .map((doc) => ({ ...serializeRecord(doc), userId: doc.ref.parent.parent?.id || '' }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.set('Cache-Control', 'no-store').json({ feedback, truncated: snapshot.size === 500 });
  } catch (error) {
    console.error('Admin feedback load failed:', error instanceof Error ? error.message : 'unknown error');
    return sendError(res, 500, 'Could not load user feedback.');
  }
});

app.get('/api/admin/users/:uid', requireAdmin, async (req, res) => {
  const uid = req.params.uid;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return sendError(res, 400, 'Invalid user ID.');

  try {
    const userRef = firestore.collection('users').doc(uid);
    const [user, files, folders, feedback] = await Promise.all([
      userRef.get(),
      userRef.collection('files').limit(200).get(),
      userRef.collection('folders').limit(200).get(),
      userRef.collection('feedback').limit(100).get(),
    ]);
    if (!user.exists) return sendError(res, 404, 'User not found.');
    return res.set('Cache-Control', 'no-store').json({
      user: userSummary(user.id, user.data() || {}),
      files: files.docs.map(serializeRecord),
      folders: folders.docs.map(serializeRecord),
      feedback: feedback.docs.map(serializeRecord),
    });
  } catch (error) {
    console.error('Admin user detail load failed:', error instanceof Error ? error.message : 'unknown error');
    return sendError(res, 500, 'Could not load this user record.');
  }
});

app.use('/api', (_req, res) => sendError(res, 404, 'API route not found.'));

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(dirname, 'dist'), { index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dirname, 'dist', 'index.html')));
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Cloudvalt Admin running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error('Admin server failed to start:', error);
  process.exit(1);
});
