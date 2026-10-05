
#include "./positionjsonwriter.h"

#include <cmath>

#include "libmscore/masterscore.h"
#include "libmscore/repeatlist.h"
#include "libmscore/system.h"

#include "engraving/types/types.h"

#include "global/log.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QJsonDocument>

using namespace mu::project;
using namespace mu::notation;
using namespace mu::engraving;
using namespace mu::io;
using namespace mu::framework;

static void writeElementPosition(QJsonArray& elements, const std::string& id, const mu::PointF& pos, const mu::PointF& sPos,
                                 page_idx_t pageIndex)
{
    QJsonObject el;
    el["id"] = std::stoi(id);
    el["x"] = pos.x();
    el["y"] = pos.y();
    el["sx"] = sPos.x();
    el["sy"] = sPos.y();
    el["page"] = (int)pageIndex;
    elements.push_back(el);
}

static void writeEventPosition(QJsonArray& events, const std::string& id, int time)
{   
    QJsonObject ev;
    ev["elid"] = std::stoi(id);
    ev["position"] = time;
    events.push_back(ev);
}

static void writeMeasureEvents(QJsonArray& events, Measure* m, int offset, const QHash<void*, int>& segments)
{
    for (mu::engraving::Segment* s = m->first(mu::engraving::SegmentType::ChordRest); s;
         s = s->next(mu::engraving::SegmentType::ChordRest)) {
        int tick = s->tick().ticks() + offset;
        int id = segments[(void*)s];
        int time = lrint(m->score()->repeatList().utick2utime(tick) * 1000);

        writeEventPosition(events, std::to_string(id), time);
    }
}

static void writePageSize(QJsonObject& json, const mu::engraving::Score* score) {
    auto page = score->pages().at(0);  // all pages sizes should be the same as the first page

    QJsonObject pageSize;
    pageSize["height"] = page->height();
    pageSize["width"] = page->width();
    json["pageSize"] = pageSize;
}

PositionJsonWriter::PositionJsonWriter(PositionJsonWriter::ElementType elementType)
    : m_elementType(elementType)
{
}

std::vector<INotationWriter::UnitType> PositionJsonWriter::supportedUnitTypes() const
{
    return { UnitType::PER_PART };
}

bool PositionJsonWriter::supportsUnitType(UnitType unitType) const
{
    std::vector<UnitType> unitTypes = supportedUnitTypes();
    return std::find(unitTypes.cbegin(), unitTypes.cend(), unitType) != unitTypes.cend();
}

QByteArray PositionJsonWriter::jsonData(engraving::Score* score) {
    QJsonObject json;
    writeElementsPositions(json, score);
    writeEventsPositions(json, score);
    writePageSize(json, score);

    QJsonDocument doc(json);
    return doc.toJson(QJsonDocument::Compact);  // UTF-8 encoded JSON data
}

QByteArray PositionJsonWriter::jsonData(INotationPtr notation) {
    mu::engraving::Score* score = notation->elements()->msScore();
    return jsonData(score);
}

mu::Ret PositionJsonWriter::write(INotationPtr notation, QIODevice& destinationDevice, const Options&)
{
    destinationDevice.write(jsonData(notation));
    destinationDevice.close();
    return true;
}

mu::Ret PositionJsonWriter::writeList(const INotationPtrList&, QIODevice&, const Options&)
{
    NOT_SUPPORTED;
    return Ret(Ret::Code::NotSupported);
}

qreal PositionJsonWriter::pngDpiResolution() const
{
    // return (imagesExportConfiguration()->exportPngDpiResolution() / mu::engraving::DPI) * 12.0;
    // return (mu::engraving::DPI / mu::engraving::DPI) * 12.0;
    // return 12.0;
    return 1.0; // for compatibility with previous webmsore versions
}

QHash<void*, int> PositionJsonWriter::elementIds(const mu::engraving::Score* score) const
{
    QHash<void*, int> elementIds;

    int id = 0;
    if (m_elementType == ElementType::SEGMENT) {
        Measure* m = score->firstMeasureMM();
        for (mu::engraving::Segment* s = (m ? m->first(mu::engraving::SegmentType::ChordRest) : nullptr);
             s; s = s->next1MM(mu::engraving::SegmentType::ChordRest)) {
            elementIds[(void*)s] = id++;
        }
    } else {
        for (Measure* m = score->firstMeasureMM(); m; m = m->nextMeasureMM()) {
            elementIds[(void*)m] = id++;
        }
    }

    return elementIds;
}

void PositionJsonWriter::writeElementsPositions(QJsonObject& json, const mu::engraving::Score* score) const
{
    switch (m_elementType) {
    case ElementType::SEGMENT:
        writeSegmentsPositions(json, score);
        break;
    case ElementType::MEASURE:
        writeMeasuresPositions(json, score);
        break;
    }
}

void PositionJsonWriter::writeSegmentsPositions(QJsonObject& json, const mu::engraving::Score* score) const
{
    int id = 0;
    qreal ndpi = pngDpiResolution();

    QJsonArray elements;

    Measure* measure = score->firstMeasureMM();
    for (mu::engraving::Segment* segment = (measure ? measure->first(mu::engraving::SegmentType::ChordRest) : nullptr);
         segment; segment = segment->next1MM(mu::engraving::SegmentType::ChordRest)) {
        // The width of the segment's box: from this segment to the next one on the same system, or to the end of its
        // measure for the last one. That is the room layout gave the notes, and it is never zero. The segment's own
        // bounding box is no use (a chord or rest has none, so every width came out 0), and calling the virtual
        // width() on an element traps in the Emscripten build ("function signature mismatch"), which made this whole
        // call fail on most real scores.
        qreal sx = 0;
        {
            const mu::engraving::Measure* own = segment->measure();
            const mu::engraving::Segment* next = segment->next1MM(mu::engraving::SegmentType::ChordRest);
            const bool sameSystem = next && next->measure()->system() == own->system();
            const qreal right = sameSystem ? next->pagePos().x() : (own->pagePos().x() + own->bbox().width());
            sx = qMax<qreal>(0, right - segment->pagePos().x());
        }

        sx *= ndpi;
        qreal sy = segment->measure()->system()->height() * ndpi;

        int x = segment->pagePos().x() * ndpi;
        int y = segment->pagePos().y() * ndpi;

        Page* page = segment->measure()->system()->page();
        page_idx_t pageIndex = score->pageIdx(page);

        writeElementPosition(elements, std::to_string(id), PointF(x, y), PointF(sx, sy), pageIndex);

        id++;
    }

    json["elements"] = elements;
}

void PositionJsonWriter::writeMeasuresPositions(QJsonObject& json, const mu::engraving::Score* score) const
{
    int id = 0;
    qreal ndpi = pngDpiResolution();

    QJsonArray elements;

    for (Measure* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        qreal sx = measure->bbox().width() * ndpi;
        qreal sy = measure->system()->height() * ndpi;
        qreal x = measure->pagePos().x() * ndpi;
        qreal y = measure->system()->pagePos().y() * ndpi;

        Page* page = measure->system()->page();
        page_idx_t pageIndex = score->pageIdx(page);

        writeElementPosition(elements, std::to_string(id), PointF(x, y), PointF(sx, sy), pageIndex);

        id++;
    }

    json["elements"] = elements;
}

void PositionJsonWriter::writeEventsPositions(QJsonObject& json, const mu::engraving::Score* score) const
{
    QHash<void*, int> elementIds = this->elementIds(score);

    QJsonArray events;

    score->masterScore()->setExpandRepeats(true);

    for (const mu::engraving::RepeatSegment* repeatSegment : score->repeatList()) {
        int startTick = repeatSegment->tick;
        int endTick = startTick + repeatSegment->len();
        int tickOffset = repeatSegment->utick - repeatSegment->tick;
        for (Measure* measure = score->tick2measureMM(Fraction::fromTicks(startTick)); measure; measure = measure->nextMeasureMM()) {
            if (m_elementType == ElementType::SEGMENT) {
                writeMeasureEvents(events, measure, tickOffset, elementIds);
            } else {
                int tick = measure->tick().ticks() + tickOffset;
                int id = elementIds[(void*)measure];
                int time = std::lrint(measure->score()->repeatList().utick2utime(tick) * 1000);

                writeEventPosition(events, std::to_string(id), time);
            }

            if (measure->endTick().ticks() >= endTick) {
                break;
            }
        }
    }

    json["events"] = events;
}
