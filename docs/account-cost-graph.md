# Account-only costs on the provider graph

The account-only cost estimate is added to Codex's headline total and the daily provider graph. Per the user's choice, it is spread across known usage days, weighted by Codex token activity. Account daily reports are used where they exceed local recorded activity; local usage supplies the remaining known days. No dates are invented when no dated activity exists.

`days`, local provider costs and model/type breakdowns retain the transcript-derived values. `accountCostDays` records the allocation; `chartDays` adds it to Codex only. The last day receives the floating-point remainder so the allocation reconciles to the estimate without duplication. Rescans derive it from source records rather than accumulating prior allocations.

Graph notes and tooltips explicitly identify allocated estimates. Combined and provider headline totals include them; percentages use the same denominator. Local model and token-type costs remain local-only.

Verified: proportional allocation, account-day inclusion, empty/zero activity, exact total reconciliation, unchanged local costs, and rendered headline/provider totals and graph tooltip at desktop and compact sizes. The repeated layout tour and interaction suite also passed. These are estimates, not dated provider invoices.
