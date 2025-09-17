import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, principalCV, stringAsciiCV } from "@stacks/transactions";

const ERR_NOT_VERIFIED = 100;
const ERR_INVALID_RATING = 101;
const ERR_DUPLICATE_REVIEW = 102;
const ERR_INVALID_COMMENT_LENGTH = 103;
const ERR_REVIEW_NOT_FOUND = 104;
const ERR_NOT_AUTHORIZED = 105;
const ERR_INVALID_TIMESTAMP = 106;
const ERR_RIDE_NOT_COMPLETED = 107;
const ERR_INVALID_DRIVER = 108;
const ERR_INVALID_REVIEW_TYPE = 120;
const ERR_INVALID_LOCATION = 118;
const ERR_INVALID_CURRENCY = 119;
const ERR_MAX_REVIEWS_EXCEEDED = 110;
const ERR_INVALID_UPDATE_PARAM = 111;
const ERR_AUTHORITY_NOT_VERIFIED = 112;
const ERR_INVALID_REWARD_AMOUNT = 115;
const ERR_INVALID_DISPUTE_PERIOD = 116;

interface Review {
  driver: string;
  passenger: string;
  rating: number;
  comment: string;
  timestamp: number;
  status: boolean;
  reviewType: string;
  location: string;
  currency: string;
  rideCompleted: boolean;
}

interface ReviewUpdate {
  updateRating: number;
  updateComment: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ReviewContractMock {
  state: {
    reviewCounter: number;
    maxReviews: number;
    minRating: number;
    maxRating: number;
    rewardAmount: number;
    disputePeriod: number;
    authorityContract: string | null;
    reviews: Map<number, Review>;
    reviewsByDriver: Map<string, number[]>;
    reviewsByPassenger: Map<string, number[]>;
    reviewUpdates: Map<number, ReviewUpdate>;
  } = {
    reviewCounter: 0,
    maxReviews: 10000,
    minRating: 1,
    maxRating: 5,
    rewardAmount: 10,
    disputePeriod: 144,
    authorityContract: null,
    reviews: new Map(),
    reviewsByDriver: new Map(),
    reviewsByPassenger: new Map(),
    reviewUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1PASSENGER";
  userDetails: Map<string, { isVerified: boolean }> = new Map([["ST1PASSENGER", { isVerified: true }]]);
  rewardsIssued: Array<{ to: string; amount: number }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      reviewCounter: 0,
      maxReviews: 10000,
      minRating: 1,
      maxRating: 5,
      rewardAmount: 10,
      disputePeriod: 144,
      authorityContract: null,
      reviews: new Map(),
      reviewsByDriver: new Map(),
      reviewsByPassenger: new Map(),
      reviewUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1PASSENGER";
    this.userDetails = new Map([["ST1PASSENGER", { isVerified: true }]]);
    this.rewardsIssued = [];
  }

  getUserDetails(principal: string): Result<{ isVerified: boolean }> {
    const details = this.userDetails.get(principal);
    if (!details) return { ok: false, value: { isVerified: false } };
    return { ok: true, value: details };
  }

  issueReward(to: string, amount: number): Result<boolean> {
    this.rewardsIssued.push({ to, amount });
    return { ok: true, value: true };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRewardAmount(newAmount: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newAmount <= 0) return { ok: false, value: false };
    this.state.rewardAmount = newAmount;
    return { ok: true, value: true };
  }

  setDisputePeriod(newPeriod: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newPeriod <= 0) return { ok: false, value: false };
    this.state.disputePeriod = newPeriod;
    return { ok: true, value: true };
  }

  submitReview(
    driver: string,
    rating: number,
    comment: string,
    reviewType: string,
    location: string,
    currency: string,
    rideCompleted: boolean
  ): Result<number> {
    if (this.state.reviewCounter >= this.state.maxReviews) return { ok: false, value: ERR_MAX_REVIEWS_EXCEEDED };
    const userData = this.getUserDetails(this.caller).value;
    if (!userData.isVerified) return { ok: false, value: ERR_NOT_VERIFIED };
    if (rating < this.state.minRating || rating > this.state.maxRating) return { ok: false, value: ERR_INVALID_RATING };
    if (comment.length > 200) return { ok: false, value: ERR_INVALID_COMMENT_LENGTH };
    if (driver === this.caller) return { ok: false, value: ERR_INVALID_DRIVER };
    if (!["positive", "negative", "neutral"].includes(reviewType)) return { ok: false, value: ERR_INVALID_REVIEW_TYPE };
    if (location.length === 0 || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (!rideCompleted) return { ok: false, value: ERR_RIDE_NOT_COMPLETED };
    if (this.state.reviews.has(this.state.reviewCounter)) return { ok: false, value: ERR_DUPLICATE_REVIEW };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    const id = this.state.reviewCounter;
    const review: Review = {
      driver,
      passenger: this.caller,
      rating,
      comment,
      timestamp: this.blockHeight,
      status: true,
      reviewType,
      location,
      currency,
      rideCompleted,
    };
    this.state.reviews.set(id, review);
    const driverReviews = this.state.reviewsByDriver.get(driver) || [];
    if (driverReviews.length < 100) driverReviews.push(id);
    this.state.reviewsByDriver.set(driver, driverReviews);
    const passengerReviews = this.state.reviewsByPassenger.get(this.caller) || [];
    if (passengerReviews.length < 100) passengerReviews.push(id);
    this.state.reviewsByPassenger.set(this.caller, passengerReviews);
    this.issueReward(this.caller, this.state.rewardAmount);
    this.state.reviewCounter++;
    return { ok: true, value: id };
  }

  getReview(id: number): Review | null {
    return this.state.reviews.get(id) || null;
  }

  updateReview(id: number, updateRating: number, updateComment: string): Result<boolean> {
    const review = this.state.reviews.get(id);
    if (!review) return { ok: false, value: ERR_REVIEW_NOT_FOUND };
    if (review.passenger !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (updateRating < this.state.minRating || updateRating > this.state.maxRating) return { ok: false, value: ERR_INVALID_RATING };
    if (updateComment.length > 200) return { ok: false, value: ERR_INVALID_COMMENT_LENGTH };
    if (this.blockHeight - review.timestamp >= this.state.disputePeriod) return { ok: false, value: ERR_INVALID_TIMESTAMP };

    const updated: Review = {
      ...review,
      rating: updateRating,
      comment: updateComment,
      timestamp: this.blockHeight,
    };
    this.state.reviews.set(id, updated);
    this.state.reviewUpdates.set(id, {
      updateRating,
      updateComment,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getReviewCount(): Result<number> {
    return { ok: true, value: this.state.reviewCounter };
  }
}

describe("ReviewContract", () => {
  let contract: ReviewContractMock;

  beforeEach(() => {
    contract = new ReviewContractMock();
    contract.reset();
  });

  it("submits a review successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const review = contract.getReview(0);
    expect(review?.driver).toBe("ST1DRIVER");
    expect(review?.passenger).toBe("ST1PASSENGER");
    expect(review?.rating).toBe(4);
    expect(review?.comment).toBe("Great ride");
    expect(review?.reviewType).toBe("positive");
    expect(review?.location).toBe("City Center");
    expect(review?.currency).toBe("STX");
    expect(review?.rideCompleted).toBe(true);
    expect(contract.rewardsIssued).toEqual([{ to: "ST1PASSENGER", amount: 10 }]);
  });

  it("rejects duplicate review id", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    contract.state.reviewCounter--;
    const result = contract.submitReview(
      "ST2DRIVER",
      3,
      "Okay ride",
      "neutral",
      "Suburb",
      "USD",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DUPLICATE_REVIEW);
  });

  it("rejects unverified user", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.userDetails.set("ST1PASSENGER", { isVerified: false });
    const result = contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_VERIFIED);
  });

  it("rejects invalid rating", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.submitReview(
      "ST1DRIVER",
      6,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RATING);
  });

  it("rejects invalid comment length", () => {
    contract.setAuthorityContract("ST2AUTH");
    const longComment = "a".repeat(201);
    const result = contract.submitReview(
      "ST1DRIVER",
      4,
      longComment,
      "positive",
      "City Center",
      "STX",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_COMMENT_LENGTH);
  });

  it("rejects self review", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.submitReview(
      "ST1PASSENGER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DRIVER);
  });

  it("rejects invalid review type", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "invalid",
      "City Center",
      "STX",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_REVIEW_TYPE);
  });

  it("rejects invalid location", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "",
      "STX",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LOCATION);
  });

  it("rejects invalid currency", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "EUR",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("rejects incomplete ride", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      false
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_RIDE_NOT_COMPLETED);
  });

  it("rejects without authority contract", () => {
    const result = contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("updates a review successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    contract.blockHeight = 10;
    const result = contract.updateReview(0, 5, "Excellent ride");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const review = contract.getReview(0);
    expect(review?.rating).toBe(5);
    expect(review?.comment).toBe("Excellent ride");
    expect(review?.timestamp).toBe(10);
    const update = contract.state.reviewUpdates.get(0);
    expect(update?.updateRating).toBe(5);
    expect(update?.updateComment).toBe("Excellent ride");
    expect(update?.updateTimestamp).toBe(10);
    expect(update?.updater).toBe("ST1PASSENGER");
  });

  it("rejects update for non-existent review", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.updateReview(99, 5, "Excellent ride");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_REVIEW_NOT_FOUND);
  });

  it("rejects update by non-owner", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    contract.caller = "ST2OTHER";
    const result = contract.updateReview(0, 5, "Excellent ride");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects update after dispute period", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    contract.blockHeight = 200;
    const result = contract.updateReview(0, 5, "Excellent ride");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });

  it("sets reward amount successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setRewardAmount(20);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.rewardAmount).toBe(20);
    contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    expect(contract.rewardsIssued).toEqual([{ to: "ST1PASSENGER", amount: 20 }]);
  });

  it("rejects reward amount change without authority", () => {
    const result = contract.setRewardAmount(20);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets dispute period successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setDisputePeriod(288);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.disputePeriod).toBe(288);
  });

  it("returns correct review count", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    contract.submitReview(
      "ST2DRIVER",
      3,
      "Okay ride",
      "neutral",
      "Suburb",
      "USD",
      true
    );
    const result = contract.getReviewCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects review submission with max reviews exceeded", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.state.maxReviews = 1;
    contract.submitReview(
      "ST1DRIVER",
      4,
      "Great ride",
      "positive",
      "City Center",
      "STX",
      true
    );
    const result = contract.submitReview(
      "ST2DRIVER",
      3,
      "Okay ride",
      "neutral",
      "Suburb",
      "USD",
      true
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_REVIEWS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2AUTH");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2AUTH");
  });
});