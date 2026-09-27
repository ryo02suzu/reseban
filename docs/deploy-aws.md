# 本番環境の構築（AWS 東京リージョン）

医療情報を扱うため、すべて **東京リージョン（ap-northeast-1）** に置きます。
アプリは Docker イメージ1つ（Next.js standalone）で、状態はすべて PostgreSQL に持つため、台数を増やしても動きます。

## 構成

```
利用者（医院のPC）
   │ HTTPS（ACM 証明書）
   ▼
AWS WAF ─ Application Load Balancer（パブリックサブネット）
   │
   ▼
ECS Fargate：reseban-app コンテナ ×2 以上（プライベートサブネット、別AZ）
   │  ├─ RDS for PostgreSQL 16（Multi-AZ、保存時暗号化 KMS、自動バックアップ・PITR）
   │  ├─ Secrets Manager（DATABASE_URL、DATA_ENCRYPTION_KEY）
   │  ├─ Amazon Bedrock（東京リージョン、VPC エンドポイント経由）
   │  └─ CloudWatch Logs（アプリログ）
   ▼
CloudTrail / GuardDuty / AWS Config（AWS 操作の監査）
```

## 手順

1. **ネットワーク**：VPC（2AZ）、パブリック／プライベートサブネット、NAT ゲートウェイ（または必要な VPC エンドポイント：ECR、Secrets Manager、Logs、Bedrock Runtime）。
2. **データベース**：RDS for PostgreSQL 16、Multi-AZ、`Storage encrypted`（KMS）、`rds.force_ssl = 1`、自動バックアップ 35日、削除保護 ON。アプリ用ユーザーを作成。
3. **秘密情報**（Secrets Manager）
   - `DATABASE_URL`：`postgres://ユーザー:パスワード@エンドポイント:5432/reseban`
   - `DATA_ENCRYPTION_KEY`：`openssl rand -base64 32` で作成。**紛失するとレセプトを復号できない**ため、別途オフラインにも保管する。
4. **イメージ**：ECR にリポジトリを作り、`docker build -t reseban-app .` → push（CI から push するのが望ましい）。
5. **ECS**：Fargate タスク定義
   - ポート 3000、ヘルスチェック `GET /api/health`
   - 環境変数：`APP_URL=https://（本番ドメイン）`、`AI_PROVIDER=bedrock`、`AWS_REGION=ap-northeast-1`
   - シークレット：`DATABASE_URL`、`DATA_ENCRYPTION_KEY`
   - タスクロール：Bedrock の `bedrock:InvokeModel` のみ（対象モデルに限定）
   - ログ：awslogs（CloudWatch、保存期間は運用規程に合わせる）
6. **ロードバランサー**：ALB（HTTPS のみ、TLS1.2以上のセキュリティポリシー）、HTTP→HTTPS リダイレクト、ACM 証明書、アイドルタイムアウト 120秒（マスター取込のため）。
7. **WAF**：AWS マネージドルール（Core rule set、Known bad inputs、IP reputation）＋レート制限。必要なら医院のIPアドレスに限定。
8. **初回起動**：タスクが起動すると DB のマイグレーションが自動で走る。
9. **運営者アカウント**：ECS Exec でコンテナに入り
   `node scripts/create-operator.mjs you@example.com` → 表示された招待リンクから登録し、2段階認証を設定。
10. **マスター取込**：運営コンソール「マスター」から、支払基金の基本マスター9ファイルを取り込む（[運用手順](operations.md)）。
11. **Bedrock**：東京リージョンで使うモデルのアクセスを有効化し、運営コンソールの「接続テスト」で確認。

## 監視

- ALB の 5xx、ターゲットの異常、RDS の CPU・接続数・空き容量に CloudWatch アラーム。
- アプリのエラーログ（`console.error`）に Logs のメトリクスフィルター。
- 操作ログ（アプリ内）は DB に保存。長期保存が必要なら定期的に S3（Object Lock）へ書き出す。

## バックアップと復旧

- RDS の自動バックアップ（PITR）と、月1回の手動スナップショット（別リージョンへのコピーは国内＝大阪リージョンに限る）。
- 復旧訓練を年1回以上行い、記録を残す。
- `DATA_ENCRYPTION_KEY` を変えると既存データは読めなくなる。鍵の入れ替えは、新旧の鍵で再暗号化する移行作業として計画する（現状は単一鍵）。

## 他の環境で動かす場合

- Google Cloud：Cloud Run（asia-northeast1）＋ Cloud SQL for PostgreSQL ＋ Vertex AI（`AI_PROVIDER=vertex`）。
- ローカルで本番同等：`DATA_ENCRYPTION_KEY=$(openssl rand -base64 32) docker compose up --build`
