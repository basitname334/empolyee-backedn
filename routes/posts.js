const express = require('express');
const router = express.Router();
const Post = require('../models/Post');

const auth = require('../middlewares/auth');

// CREATE POST
router.post('/create', auth, async (req, res) => {
  try {
    const { content, avatarUrl } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Post content is required' });
    }

    // Extract hashtags from content
    const hashtags = content.match(/#[a-zA-Z0-9_]+/g) || [];

    const newPost = new Post({
      content: content.trim(),
      userId: req.user.id,
      username: req.user.name,
      email: req.user.email,
      role: req.user.role,
      avatarUrl: avatarUrl || null,
      hashtags: hashtags,
      likes: 0,
      isBlocked: false
    });

    const savedPost = await newPost.save();
    
    res.status(201).json({
      message: 'Post created successfully',
      post: savedPost
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET POSTS - Show user's own posts for employees, all posts for admins
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    let query = { isBlocked: false };
    
    // If user is employee, show only their posts
    if (req.user.role === 'employee') {
      query.userId = req.user.id;
    }
    // If user is admin, show all posts (already handled by query = { isBlocked: false })

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Post.countDocuments(query);

    res.json({
      posts,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalPosts: total
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET BLOCKED POSTS - Only for admins
router.get('/blocked', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { page = 1, limit = 10 } = req.query;
    
    const blockedPosts = await Post.find({ isBlocked: true })
      .sort({ blockedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Post.countDocuments({ isBlocked: true });

    res.json({
      posts: blockedPosts,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalPosts: total
    });
  } catch (error) {
    console.error('Error fetching blocked posts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// BLOCK POST - Only for admins
router.put('/:postId/block', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { postId } = req.params;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.isBlocked) {
      return res.status(400).json({ message: 'Post is already blocked' });
    }

    post.isBlocked = true;
    post.blockedBy = req.user.id;
    post.blockedAt = new Date();
    
    await post.save();

    res.json({
      message: 'Post blocked successfully',
      post
    });
  } catch (error) {
    console.error('Error blocking post:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// UNBLOCK POST - Only for admins
router.put('/:postId/unblock', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { postId } = req.params;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (!post.isBlocked) {
      return res.status(400).json({ message: 'Post is not blocked' });
    }

    post.isBlocked = false;
    post.blockedBy = null;
    post.blockedAt = null;
    
    await post.save();

    res.json({
      message: 'Post unblocked successfully',
      post
    });
  } catch (error) {
    console.error('Error unblocking post:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE POST - Users can delete their own posts, admins can delete any post
router.delete('/:postId', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user owns the post or is admin
    if (post.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Post.findByIdAndDelete(postId);

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// LIKE POST (optional feature)
router.put('/:postId/like', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.likes += 1;
    await post.save();

    res.json({
      message: 'Post liked successfully',
      likes: post.likes
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;