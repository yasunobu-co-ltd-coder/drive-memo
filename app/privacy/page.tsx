export default function PrivacyPolicy() {
  return (
    <div style={{
      maxWidth: 640, margin: '0 auto', padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#1e293b', lineHeight: 1.8,
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>プライバシーポリシー</h1>

      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>最終更新日: 2026年4月7日</p>

      <Section title="1. 運営者">
        本アプリ「drive」（以下「本アプリ」）は、安信工業株式会社（以下「当社」）が運営しています。
      </Section>

      <Section title="2. 取得する情報">
        本アプリでは、以下の情報を取得・利用します。
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>会社コード・パスワード（認証目的）</li>
          <li>ユーザー名（表示・識別目的）</li>
          <li>案件メモ情報（会社名、担当者名、メモ内容、期日等）</li>
          <li>Googleアカウント情報（Googleカレンダー連携を利用する場合のみ）</li>
        </ul>
      </Section>

      <Section title="3. 情報の利用目的">
        取得した情報は、以下の目的にのみ利用します。
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>本アプリの機能提供（案件管理、カレンダー連携）</li>
          <li>ユーザー認証およびセッション管理</li>
        </ul>
      </Section>

      <Section title="4. Googleカレンダー連携について">
        本アプリは、ユーザーの同意のもとGoogleカレンダーAPIを利用して予定の作成・更新・削除を行います。
        取得したアクセストークンはサーバー上に安全に保管され、カレンダー操作以外の目的には使用しません。
        連携はいつでもアプリ内の設定から解除できます。
      </Section>

      <Section title="5. 第三者提供">
        取得した情報は、法令に基づく場合を除き、第三者に提供することはありません。
      </Section>

      <Section title="6. データの保管">
        データはSupabase（クラウドデータベース）上に保管され、適切なアクセス制御を実施しています。
      </Section>

      <Section title="7. お問い合わせ">
        プライバシーに関するお問い合わせは、当社までご連絡ください。
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
      <div style={{ fontSize: 15 }}>{children}</div>
    </div>
  );
}
