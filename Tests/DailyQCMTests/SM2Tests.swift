import XCTest
@testable import DailyQCM

final class SM2Tests: XCTestCase {

    private func makeState() -> ReviewState { ReviewState(dueDate: .now) }

    func testFirstCorrectReviewSchedulesOneDay() {
        let state = makeState()
        let today = Date().startOfDay()
        SM2.apply(to: state, grade: .good, on: today)

        XCTAssertEqual(state.repetitions, 1)
        XCTAssertEqual(state.interval, 1)
        XCTAssertEqual(state.totalReviews, 1)
        XCTAssertEqual(state.dueDate, today.adding(days: 1))
        // Quality 4 ("good") leaves the ease factor unchanged; only 5 ("easy") raises it.
        XCTAssertEqual(state.easeFactor, 2.5, accuracy: 1e-9)
    }

    func testEasyGradeRaisesEaseFactor() {
        let state = makeState()
        SM2.apply(to: state, grade: .easy)
        XCTAssertEqual(state.easeFactor, 2.6, accuracy: 1e-9)
    }

    func testSecondCorrectReviewIsSixDays() {
        let state = makeState()
        SM2.apply(to: state, grade: .good)
        SM2.apply(to: state, grade: .good)

        XCTAssertEqual(state.repetitions, 2)
        XCTAssertEqual(state.interval, 6)
    }

    func testThirdCorrectReviewMultipliesByEase() {
        let state = makeState()
        SM2.apply(to: state, grade: .good) // interval 1
        SM2.apply(to: state, grade: .good) // interval 6
        let easeBefore = state.easeFactor
        SM2.apply(to: state, grade: .good) // interval round(6 * ease)

        XCTAssertEqual(state.interval, Int((6.0 * easeBefore).rounded()))
        XCTAssertEqual(state.repetitions, 3)
    }

    func testIncorrectAnswerResetsRepetitionsAndRecordsLapse() {
        let state = makeState()
        SM2.apply(to: state, grade: .good)
        SM2.apply(to: state, grade: .good)
        SM2.apply(to: state, grade: .again)

        XCTAssertEqual(state.repetitions, 0)
        XCTAssertEqual(state.interval, 1)
        XCTAssertEqual(state.lapses, 1)
        XCTAssertEqual(state.dueDate, Date().startOfDay().adding(days: 1))
    }

    func testEaseFactorNeverDropsBelowFloor() {
        let state = makeState()
        for _ in 0..<20 { SM2.apply(to: state, grade: .again) }
        XCTAssertEqual(state.easeFactor, SM2.minEaseFactor, accuracy: 0.0001)
    }

    func testBinaryGradeMapping() {
        XCTAssertEqual(ReviewGrade.forBinary(correct: true), .good)
        XCTAssertEqual(ReviewGrade.forBinary(correct: false), .again)
    }
}
