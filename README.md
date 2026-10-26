# Home Sensors

Zentrale Sammlung und Auswertung von Smart-Home-Sensordaten mit Supabase.
Erste Quelle: SwitchBot Cloud API v1.1. Später: lokale BLE-Daten, Shelly und Wetter.

## Aufbau

- `supabase/migrations`: versionierte Datenbankschemaänderungen.
- `supabase/functions/collect-switchbot`: TypeScript Edge Function ohne externe Pakete.
- `supabase/operations`: betriebliche Konfiguration des regelmäßigen Abrufs.
- `tests`: Tests mit synthetischen Daten, ausführbar mit Node.js 24 und `npm test`.
- `docs/setup.md`: Einrichtung, Secrets, Betrieb und Wiederherstellung.

Der Sammler entdeckt Meter/Meter Plus und Hub 2, ruft deren Status ab und speichert
die vollständige erfolgreiche API-Antwort in einer JSONB-Spalte. Unbekannte Felder
bleiben erhalten. Cloud und spätere BLE-Daten werden getrennt gespeichert.
`received_at` bezeichnet den Empfang der Cloud-Antwort, nicht den Messzeitpunkt.

Unveränderte Antworten werden auch im nächsten Zwei-Minuten-Intervall gespeichert.
Wiederholte Aufrufe innerhalb desselben UTC-Zwei-Minuten-Intervalls erzeugen pro Gerät
höchstens eine Zeile. Das ist keine Aussage über den Aktualisierungstakt der Cloud.

## Sicherheit und Daten

Dieses Repository enthält ausschließlich Code, Schema und Dokumentation.
Keine echten Sensorantworten, Geräte-IDs oder Zugangsdaten einchecken.
Die Tabelle hat RLS aktiviert und ist für `anon` und `authenticated` gesperrt.
Der Sammler schreibt serverseitig mit einem privilegierten Supabase-Schlüssel.
Die Edge Function prüft vor jedem Abruf einen eigenen `x-collector-token`.
Es gibt noch keine Benutzeroberfläche oder Freigabe für direktes Lesen durch Clients.

## Entwicklungsstand

Bootstrap für Cloud-Sammlung; die Einrichtung ist erst abgeschlossen, wenn Secrets
gesetzt, ein echter Abruf verifiziert und der Cron-Job aktiviert wurden.
Laufende Messwertsicherungen sind separat einzurichten; Git sichert das Schema und
den Code, nicht die Messdaten. Es gibt noch keine automatische Löschung/Verdichtung.
