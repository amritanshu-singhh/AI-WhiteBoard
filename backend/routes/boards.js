const express = require('express');
const router = express.Router();
const Board = require('../models/Board');

// List all boards (id, name, updatedAt, thumbnail) - newest first
router.get('/', async (req, res) => {
  try {
    const boards = await Board.find({}, 'name owner thumbnail updatedAt').sort({ updatedAt: -1 });
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single board (full strokes) for loading into canvas
router.get('/:id', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new empty board, returns its id (used as the room id for collaboration)
router.post('/', async (req, res) => {
  try {
    const board = await Board.create({
      name: req.body.name || 'Untitled Board',
      owner: req.body.owner || 'anonymous'
    });
    res.status(201).json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save/update a board: strokes, thumbnail snapshot, recognized text
router.put('/:id', async (req, res) => {
  try {
    const { name, strokes, thumbnail, recognizedText } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (strokes !== undefined) update.strokes = strokes;
    if (thumbnail !== undefined) update.thumbnail = thumbnail;
    if (recognizedText !== undefined) update.recognizedText = recognizedText;

    const board = await Board.findByIdAndUpdate(req.params.id, update, {
      new: true,
      upsert: true
    });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a board
router.delete('/:id', async (req, res) => {
  try {
    await Board.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
