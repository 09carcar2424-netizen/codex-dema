# Customer Portal v1

Primary domain:

- `wordfriends.co.kr`

Purpose:

- Customer recruitment
- Customer login
- Customer-owned site status
- AdSense status tracking
- Monthly settlement display
- Agency fee records
- Referral reward records
- Notices and support tickets

## Safety Position

The portal must not promise AdSense approval, traffic, or revenue.

Recommended wording:

- Site setup and operations support
- Content production and publishing support
- AdSense readiness support
- Customer-owned domain and customer-owned AdSense account

Avoid wording:

- Guaranteed monthly income
- Guaranteed AdSense approval
- Passive income guarantee
- Automatic profit system

## Referral Policy

Current decision:

- Store referral relationships.
- Activate only level-1 referral rewards.
- Keep level-2 and level-3 structures available in the database but inactive.
- Do not show multi-level compensation in customer-facing UI until legal and tax review is complete.

Recommended customer-facing label:

- 소개 보상
- 파트너 리워드
- 추천 감사금

Avoid labels:

- 하위 수당
- 조직 수당
- 다단계 수당

## Portal Menus

Customer view:

- My sites
- AdSense status
- Content and publishing status
- Monthly settlement
- Referral code
- Referral reward history
- Notices
- Support request

Admin view:

- Customers
- Applications
- Contracts
- Sites
- AdSense readiness
- Settlements
- Referral relationships
- Reward rules
- Reward payouts
- Risk flags

## Initial Reward Rule

Default active rule:

- Depth: 1
- Basis: setup fee or monthly agency fee
- Type: fixed or percentage
- Status: active only after policy confirmation

Default inactive rules:

- Depth: 2
- Depth: 3

These remain disabled until legal and tax review is complete.

## Required Logs

The platform should log:

- Who referred whom
- Which rule produced the reward
- Which settlement month was used
- Whether the reward was held, confirmed, paid, or voided
- Admin notes for disputes

## Risk Controls

- One referred customer can have only one direct referrer.
- Rewards are not created until the referred customer becomes a paying customer.
- Rewards can be held if the customer requests refund, cancels, or violates policy.
- Rewards should not be presented as investment income.
- Customer must agree that AdSense revenue is not guaranteed.
