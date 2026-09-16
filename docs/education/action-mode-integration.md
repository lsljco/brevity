# Education persistence implementation note

The existing Action Mode currently supports planning/calendar/projects/finance domains. Isaiah Tutor completion is educational evidence, not generic planning data. Do not overload the planning domain or permit direct shared-state writes merely to ship faster.

The next persistence patch must add an explicit Education action/resource contract (for example `education.tutor.session.complete`) with a dedicated authoritative resource. It must use the existing proposal -> exact expected version -> prepared journal -> conditional mutation -> immutable audit -> Undo sequence. The pure `educationRecord.js` reducer is the mutation function for that resource.

Required authorization: household administrators may complete/correct sessions; a non-admin administering the session may submit evidence only when Education permission is explicitly enabled. Isaiah child mode must never be able to promote its own mastery status directly; mastery is derived from response evidence.
