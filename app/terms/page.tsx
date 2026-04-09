export default function Terms() {
  return (
    <div style={{
      maxWidth: 640, margin: '0 auto', padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#1e293b', lineHeight: 1.8,
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>利用規約</h1>

      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>最終更新日: 2026年4月10日</p>

      <Section title="第1条（適用）">
        本規約は、安信工業株式会社（以下「当社」）が提供するアプリ「drive-memo」（以下「本アプリ」）の利用に関する条件を定めるものです。
        ユーザーは、本アプリを利用することにより、本規約に同意したものとみなします。
      </Section>

      <Section title="第2条（利用資格）">
        本アプリは、当社が発行した会社コードおよびパスワードを保有する法人・団体のみが利用できます。
        アカウント情報の管理はユーザーの責任とし、第三者への貸与・共有は禁止します。
      </Section>

      <Section title="第3条（禁止事項）">
        ユーザーは、以下の行為を行ってはなりません。
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>本アプリの不正アクセス、リバースエンジニアリング、改ざん</li>
          <li>他のユーザーまたは第三者の権利を侵害する行為</li>
          <li>本アプリのサーバーに過度な負荷をかける行為</li>
          <li>法令または公序良俗に反する行為</li>
          <li>当社の業務を妨害する行為</li>
        </ul>
      </Section>

      <Section title="第4条（サービスの提供）">
        当社は、本アプリの機能改善・保守等のため、事前の通知なくサービス内容の変更、一時停止、または終了を行うことがあります。
        これによりユーザーに生じた損害について、当社は一切の責任を負いません。
      </Section>

      <Section title="第5条（データの取扱い）">
        本アプリに登録されたデータ（案件メモ、ユーザー情報等）の管理には十分注意を払いますが、
        データの消失・破損等について、当社は故意または重過失がある場合を除き、責任を負いません。
        重要なデータはユーザー自身でバックアップを取ることを推奨します。
      </Section>

      <Section title="第6条（Googleカレンダー連携）">
        本アプリはGoogleカレンダーAPIを利用した連携機能を提供します。
        連携により取得した情報はカレンダー操作の目的にのみ使用し、それ以外の目的には使用しません。
        Google APIの利用は、<a href="https://developers.google.com/terms" style={{ color: '#2563eb' }}>Google API利用規約</a>および
        <a href="https://policies.google.com/privacy" style={{ color: '#2563eb' }}>Googleプライバシーポリシー</a>に準拠します。
      </Section>

      <Section title="第7条（音声入力機能）">
        本アプリの音声入力機能では、録音された音声データをOpenAI社のAPIに送信し文字起こしを行います。
        音声データは文字起こし処理後、当社サーバーには保存されません。
        OpenAI社のデータ取扱いについては、<a href="https://openai.com/policies/privacy-policy" style={{ color: '#2563eb' }}>OpenAIプライバシーポリシー</a>をご確認ください。
      </Section>

      <Section title="第8条（知的財産権）">
        本アプリに関する知的財産権は、すべて当社に帰属します。
        ユーザーが本アプリに登録したデータの権利は、ユーザーに帰属します。
      </Section>

      <Section title="第9条（免責事項）">
        <ul style={{ paddingLeft: 20 }}>
          <li>本アプリは「現状のまま」提供され、特定目的への適合性を保証するものではありません。</li>
          <li>通信障害、サーバー障害、第三者による不正アクセス等に起因する損害について、当社は責任を負いません。</li>
          <li>本アプリの利用により生じたユーザー間または第三者とのトラブルについて、当社は一切関与しません。</li>
        </ul>
      </Section>

      <Section title="第10条（規約の変更）">
        当社は、必要に応じて本規約を変更することがあります。
        変更後の規約は、本アプリ上に掲載した時点で効力を生じるものとします。
      </Section>

      <Section title="第11条（準拠法・管轄）">
        本規約の解釈は日本法に準拠し、本アプリに関する紛争については、当社本店所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
      </Section>

      <Section title="お問い合わせ">
        本規約に関するお問い合わせは、以下までご連絡ください。
        <div style={{ marginTop: 8 }}>
          安信工業株式会社<br />
          メール: yasunobu.co.ltd@gmail.com
        </div>
      </Section>

      <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #e2e8f0', fontSize: 14, color: '#64748b', display: 'flex', gap: 16 }}>
        <a href="/privacy" style={{ color: '#2563eb', textDecoration: 'none' }}>プライバシーポリシー</a>
        <a href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>ホームに戻る</a>
      </div>
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
