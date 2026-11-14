# RecordActions — site-wide ثبت + پیامک

**Design HOLD:** additive controls only — do not change AppShell theme / lux / 3D.

## Pattern
- `src/components/record-actions.tsx` — optional «ثبت» (`onSave`) + «پیامک» → shared `SmsComposeDialog`
- SMS default remains dry-run via panel/server settings; compose shows dry-run result labels
- **Never invent deletes** from RecordActions
- Customer field writes: **PATCH only** (`persist-api.patchCustomer`) — never PUT

## Where wired
| Page | SMS | Edit |
|---|---|---|
| پرونده ۳۶۵ (`customers.$customerId`) | yes | yes — fullName/phone/note → PATCH; holder read-only |
| مشتریان | yes | link «ویرایش» → dossier `#edit-customer` |
| بیمه‌نامه‌ها / اقساط / تمدید | yes | via CustomerNameLink → dossier |
| پنل پیامک / وظایف فوری | yes | hideSave |

## Documents (پرونده ۳۶۵)
- Panel: `CustomerDocumentsPanel`
- Live keys: `C-K{holder}` (e.g. `C-K825221`)
- Routes: `GET|POST /api/customers/{key}/documents`, soft-delete `POST /api/documents/{id}/delete`
- Volume: `/opt/fasihi/documents`

## Karafarin M1–M8
Do **not** carpet-bomb skeletons with fake editors — SMS via RecordActions only when a real mobile exists.
