// ============================================================
// drive v2 — 共通型定義
// ============================================================

export type Importance = 'high' | 'mid' | 'low';
export type AssignmentType = '任せる' | '自分で';
export type DealStatus = '未着手' | '対応中' | 'done';

export type Company = {
  id: string;
  code: string;
  name: string;
};

export type User = {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
};

export type Deal = {
  id: string;
  created_at: string;
  updated_at: string;
  company_id: string;
  created_by: string;
  client_name: string;
  contact_person: string;
  memo: string;
  due_date: string | null;
  importance: Importance;
  assignment_type: AssignmentType;
  assignee: string | null;
  status: DealStatus;
  image_url?: string | null;
  // JOIN で取得
  created_user?: { name: string } | null;
  assignee_user?: { name: string } | null;
};

// ローカルストレージに保存する認証情報
export type StoredAuth = {
  deviceToken: string;
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
};
