(define-constant ERR-NOT-VERIFIED u100)
(define-constant ERR-INVALID-RATING u101)
(define-constant ERR-DUPLICATE-REVIEW u102)
(define-constant ERR-INVALID-COMMENT-LENGTH u103)
(define-constant ERR-REVIEW-NOT-FOUND u104)
(define-constant ERR-NOT-AUTHORIZED u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-RIDE-NOT-COMPLETED u107)
(define-constant ERR-INVALID-DRIVER u108)
(define-constant ERR-INVALID-PASSENGER u109)
(define-constant ERR-MAX-REVIEWS-EXCEEDED u110)
(define-constant ERR-INVALID-UPDATE-PARAM u111)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u112)
(define-constant ERR-INVALID-MIN-RATING u113)
(define-constant ERR-INVALID-MAX-RATING u114)
(define-constant ERR-INVALID-REWARD-AMOUNT u115)
(define-constant ERR-INVALID-DISPUTE-PERIOD u116)
(define-constant ERR-INVALID-STATUS u117)
(define-constant ERR-INVALID-LOCATION u118)
(define-constant ERR-INVALID-CURRENCY u119)
(define-constant ERR-INVALID-REVIEW-TYPE u120)

(define-data-var review-counter uint u0)
(define-data-var max-reviews uint u10000)
(define-data-var min-rating uint u1)
(define-data-var max-rating uint u5)
(define-data-var reward-amount uint u10)
(define-data-var dispute-period uint u144)
(define-data-var authority-contract (optional principal) none)

(define-map reviews
  { review-id: uint }
  {
    driver: principal,
    passenger: principal,
    rating: uint,
    comment: (string-ascii 200),
    timestamp: uint,
    status: bool,
    review-type: (string-ascii 20),
    location: (string-ascii 100),
    currency: (string-ascii 20),
    ride-completed: bool
  }
)

(define-map reviews-by-driver
  { driver: principal }
  (list 100 uint))

(define-map reviews-by-passenger
  { passenger: principal }
  (list 100 uint))

(define-map review-updates
  { review-id: uint }
  {
    update-rating: uint,
    update-comment: (string-ascii 200),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-review (id uint))
  (map-get? reviews { review-id: id })
)

(define-read-only (get-review-updates (id uint))
  (map-get? review-updates { review-id: id })
)

(define-read-only (get-reviews-by-driver (driver principal))
  (map-get? reviews-by-driver { driver: driver })
)

(define-read-only (get-reviews-by-passenger (passenger principal))
  (map-get? reviews-by-passenger { passenger: passenger })
)

(define-private (validate-rating (rating uint))
  (let ((min-r (var-get min-rating)) (max-r (var-get max-rating)))
    (if (and (>= rating min-r) (<= rating max-r))
        (ok true)
        (err ERR-INVALID-RATING)))
)

(define-private (validate-comment (comment (string-ascii 200)))
  (if (<= (len comment) u200)
      (ok true)
      (err ERR-INVALID-COMMENT-LENGTH))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-driver (driver principal))
  (if (not (is-eq driver tx-sender))
      (ok true)
      (err ERR-INVALID-DRIVER))
)

(define-private (validate-passenger (passenger principal))
  (if (not (is-eq passenger 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-PASSENGER))
)

(define-private (validate-review-type (type (string-ascii 20)))
  (if (or (is-eq type "positive") (is-eq type "negative") (is-eq type "neutral"))
      (ok true)
      (err ERR-INVALID-REVIEW-TYPE))
)

(define-private (validate-location (loc (string-ascii 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-currency (cur (string-ascii 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-ride-completed (completed bool))
  (if completed
      (ok true)
      (err ERR-RIDE-NOT-COMPLETED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-reviews (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-reviews new-max)
    (ok true)
  )
)

(define-public (set-reward-amount (new-amount uint))
  (begin
    (asserts! (> new-amount u0) (err ERR-INVALID-REWARD-AMOUNT))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set reward-amount new-amount)
    (ok true)
  )
)

(define-public (set-dispute-period (new-period uint))
  (begin
    (asserts! (> new-period u0) (err ERR-INVALID-DISPUTE-PERIOD))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set dispute-period new-period)
    (ok true)
  )
)

(define-public (submit-review
  (driver principal)
  (rating uint)
  (comment (string-ascii 200))
  (review-type (string-ascii 20))
  (location (string-ascii 100))
  (currency (string-ascii 20))
  (ride-completed bool)
)
  (let (
        (passenger tx-sender)
        (review-id (var-get review-counter))
        (user-data (try! (contract-call? .user-identity get-user-details passenger)))
        (authority (var-get authority-contract))
      )
    (asserts! (< review-id (var-get max-reviews)) (err ERR-MAX-REVIEWS-EXCEEDED))
    (asserts! (get is-verified user-data) (err ERR-NOT-VERIFIED))
    (try! (validate-rating rating))
    (try! (validate-comment comment))
    (try! (validate-driver driver))
    (try! (validate-review-type review-type))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (try! (validate-ride-completed ride-completed))
    (asserts! (is-none (get-review review-id)) (err ERR-DUPLICATE-REVIEW))
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-VERIFIED))
    (map-set reviews { review-id: review-id }
      {
        driver: driver,
        passenger: passenger,
        rating: rating,
        comment: comment,
        timestamp: block-height,
        status: true,
        review-type: review-type,
        location: location,
        currency: currency,
        ride-completed: ride-completed
      }
    )
    (map-set reviews-by-driver { driver: driver }
      (unwrap! (as-max-len? (append (default-to (list) (map-get? reviews-by-driver { driver: driver })) review-id) u100) (err u999))
    )
    (map-set reviews-by-passenger { passenger: passenger }
      (unwrap! (as-max-len? (append (default-to (list) (map-get? reviews-by-passenger { passenger: passenger })) review-id) u100) (err u999))
    )
    (try! (contract-call? .token-reward issue-reward passenger (var-get reward-amount)))
    (var-set review-counter (+ review-id u1))
    (print { event: "review-submitted", id: review-id })
    (ok review-id)
  )
)

(define-public (update-review
  (review-id uint)
  (update-rating uint)
  (update-comment (string-ascii 200))
)
  (let ((review (map-get? reviews { review-id: review-id })))
    (match review
      r
        (begin
          (asserts! (is-eq (get passenger r) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-rating update-rating))
          (try! (validate-comment update-comment))
          (asserts! (< (- block-height (get timestamp r)) (var-get dispute-period)) (err ERR-INVALID-TIMESTAMP))
          (map-set reviews { review-id: review-id }
            (merge r {
              rating: update-rating,
              comment: update-comment,
              timestamp: block-height
            })
          )
          (map-set review-updates { review-id: review-id }
            {
              update-rating: update-rating,
              update-comment: update-comment,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "review-updated", id: review-id })
          (ok true)
        )
      (err ERR-REVIEW-NOT-FOUND)
    )
  )
)

(define-public (get-review-count)
  (ok (var-get review-counter))
)