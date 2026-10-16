export const REPO_OWNER = 'Cyrus060224';
export const REPO_NAME = 'Cyrus-s-IP';
export const REPO_BRANCH = 'main';

export const STORAGE_KEY_PAT = 'cyrus_github_pat';
export const STORAGE_KEY_OWNER = 'cyrus_owner_mode';
export const STORAGE_KEY_VISITOR_PREVIEW = 'cyrus_visitor_preview';

/**
 * Check the current browser's owner authentication state
 */
export function getOwnerState() {
  if (typeof window === 'undefined') {
    return { isOwner: false, hasToken: false, isVisitorPreview: false, token: null };
  }
  const token = localStorage.getItem(STORAGE_KEY_PAT);
  const isOwner = localStorage.getItem(STORAGE_KEY_OWNER) === 'true' && Boolean(token);
  const isVisitorPreview = localStorage.getItem(STORAGE_KEY_VISITOR_PREVIEW) === 'true';

  return {
    isOwner: isOwner && !isVisitorPreview,
    hasToken: Boolean(token),
    isVisitorPreview,
    token
  };
}

/**
 * Set token and enable owner mode
 */
export function setOwnerToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_PAT, token.trim());
  localStorage.setItem(STORAGE_KEY_OWNER, 'true');
  localStorage.removeItem(STORAGE_KEY_VISITOR_PREVIEW);
  document.documentElement.setAttribute('data-owner-mode', 'true');
}

/**
 * Clear owner credentials
 */
export function clearOwnerToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_PAT);
  localStorage.removeItem(STORAGE_KEY_OWNER);
  localStorage.removeItem(STORAGE_KEY_VISITOR_PREVIEW);
  document.documentElement.removeAttribute('data-owner-mode');
}

/**
 * Toggle temporary visitor preview mode without clearing the token
 */
export function toggleVisitorPreview() {
  if (typeof window === 'undefined') return false;
  const current = localStorage.getItem(STORAGE_KEY_VISITOR_PREVIEW) === 'true';
  const next = !current;
  if (next) {
    localStorage.setItem(STORAGE_KEY_VISITOR_PREVIEW, 'true');
    document.documentElement.removeAttribute('data-owner-mode');
  } else {
    localStorage.removeItem(STORAGE_KEY_VISITOR_PREVIEW);
    if (localStorage.getItem(STORAGE_KEY_OWNER) === 'true' && localStorage.getItem(STORAGE_KEY_PAT)) {
      document.documentElement.setAttribute('data-owner-mode', 'true');
    }
  }
  return next;
}

/**
 * Utf8 to Base64 (supporting Chinese, emojis, special characters)
 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binString = '';
  for (let i = 0; i < bytes.length; i++) {
    binString += String.fromCharCode(bytes[i]);
  }
  return btoa(binString);
}

/**
 * File to Base64 (stripping data:mime;base64, prefix)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Generate a clean URL slug from title
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `item-${Date.now()}`;
}

/**
 * Test token permissions against GitHub API
 */
export async function verifyGitHubToken(token: string): Promise<{ valid: boolean; user?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (res.ok) {
      const data = await res.json();
      return { 
        valid: true, 
        user: data.permissions?.push ? '已授权写权限' : '仅有读权限' 
      };
    } else {
      const err = await res.json().catch(() => ({}));
      return { valid: false, error: err.message || 'Token 无效或权限不足' };
    }
  } catch (err: any) {
    return { valid: false, error: err.message || '网络请求失败' };
  }
}

/**
 * Commit a file to GitHub repository via REST API
 */
export async function commitFileToGitHub(
  path: string, 
  contentBase64: string, 
  commitMessage: string,
  token: string
): Promise<any> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  
  // Obtain SHA if file already exists
  let sha: string | undefined = undefined;
  try {
    const checkRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (checkRes.ok) {
      const existingData = await checkRes.json();
      sha = existingData.sha;
    }
  } catch (e) {
    // New file
  }

  const payload: any = {
    message: commitMessage,
    content: contentBase64,
    branch: REPO_BRANCH
  };
  if (sha) {
    payload.sha = sha;
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || `GitHub API 提交错误 (${res.status})`);
  }

  return await res.json();
}
