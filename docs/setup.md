# Einrichtung und Betrieb

## Secrets (nur im Supabase-Dashboard)

Unter Edge Functions → Secrets:

- `SWITCHBOT_TOKEN`: Open Token aus der SwitchBot-App.
- `SWITCHBOT_SECRET`: zugehöriger Secret Key.
- `COLLECTOR_TOKEN`: zufälliger, mindestens 32 Byte langer gemeinsamer Schlüssel.
- Optional `SWITCHBOT_DEVICE_IDS`: kommagetrennte Geräte-IDs als Auswahl.

Der Supabase-Datenbankschlüssel und die Projekt-URL werden in der gehosteten
Function automatisch bereitgestellt. Werte nie in Git, Chat oder Logs kopieren.
In der SwitchBot-App bei Bedarf Cloud-/Drittanbieterdienste für die Sensoren aktivieren.

## Migration und Bereitstellung

Die Migrationen im Repository sind die Quelle für das Schema. Eine bereits über MCP
angewendete Migration darf nicht erneut unter einer anderen Version angewendet werden.
Beim Einrichten einer lokalen Umgebung zuerst die remote Migrationshistorie vergleichen.
Neue Migrationsdateien mit `supabase migration new <name>` erzeugen.

Die Function besteht aus `index.ts` und `collector.ts`. Die Konfiguration setzt
`verify_jwt = false`, weil die Function selbst `x-collector-token` prüft; diesen Schutz
nicht entfernen. Der Supabase-Service-Schlüssel darf nicht als Aufrufschlüssel dienen.

## Erster Test

Im Function-Dashboard per POST mit Header `x-collector-token` und dem Wert von
`COLLECTOR_TOKEN` aufrufen. Es werden keine Request-Body-Parameter benötigt.
200 liefert die Anzahl übermittelter Datensätze; 502 meldet einen teilweisen oder
vollständigen Fehler. `submitted` zählt übermittelte, nicht zwingend neu angelegte Zeilen.
Fehlerhafte Sensorantworten werden nicht als gültige Messwerte gespeichert.

Im SQL-Editor prüfen:

```sql
select device_type, count(*), max(received_at)
from public.switchbot_cloud_readings
group by device_type;
```

## Alle zwei Minuten

Nach erfolgreichem Test `pg_cron` und `pg_net` über Extensions aktivieren.
Im Vault die Projekt-Basis-URL als `home_sensors_project_url` und denselben
Schlüssel wie `COLLECTOR_TOKEN` als `home_sensors_collector_token` speichern.
Secrets nur im Supabase-Dashboard eingeben. Anschließend
`supabase/operations/schedule_switchbot.sql` ausführen.

Der Sammler erzeugt bei N Geräten `(N + 1) × 720` SwitchBot-Requests pro Tag.
Die Obergrenze von zehn Geräten begrenzt ihn auf 7.920 Requests; andere Apps teilen
sich das Kontolimit von 10.000/Tag. Keine automatischen Retries. Bei mehr Geräten
Auswahl einschränken oder Intervall und Poll-Slot-Logik gemeinsam anpassen.

Cron-Erfolg bedeutet zunächst nur, dass der HTTP-Aufruf eingeplant wurde.
Function-Logs, HTTP-Antworten in `net._http_response` und tatsächliche neue Zeilen prüfen.
Cron- und HTTP-Verlauf regelmäßig bereinigen; sie sind kein dauerhaftes Monitoring.
Nach 48 Stunden Aktualität der Cloud-Werte und Speicherwachstum bewerten.

Zum Pausieren:

```sql
select cron.alter_job(job_id := jobid, active := false)
from cron.job where jobname = 'collect-switchbot-every-two-minutes';
```

## Spätere lokale Entwicklung / Wiederherstellung

Repository klonen, Supabase CLI einrichten, mit dem gewünschten Projekt verknüpfen.
Vor CLI-Befehlen deren aktuelle `--help` lesen. Migrationen anwenden, Secrets erneut
setzen und Function bereitstellen. Vault und Cron sind umgebungsspezifisch separat
einzurichten. Messdaten benötigen zusätzlich regelmäßige Exporte; der Free-Tarif
enthält keine automatischen Datenbankbackups. Keine Echtdaten-Backups ins Git legen.

## Quellen

- https://github.com/OpenWonderLabs/SwitchBotAPI
- https://supabase.com/docs/guides/functions
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/functions/secrets
