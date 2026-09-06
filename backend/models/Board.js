const mongoose = require('mongoose');

const StrokeSchema = new mongoose.Schema(
  {
    x0: Number,
    y0: Number,
    x1: Number,
    y1: Number,
    color: String,
    size: Number,
    tool: { type: String, default: 'pen' } // 'pen' | 'eraser'
  },
  { _id: false }
);

const BoardSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Untitled Board' },
    owner: { type: String, default: 'anonymous' },
    strokes: { type: [StrokeSchema], default: [] },
    thumbnail: { type: String, default: '' },     
    recognizedText: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Board', BoardSchema);
